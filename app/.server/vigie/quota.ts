/**
 * Quotas (ADR-0011, E5 et E8) : un quota pour le serveur, un autre pour le navigateur, pour qu'une
 * inondation du navigateur ne rende jamais le serveur muet. Fenêtre fixe d'une minute, un plafond
 * global et, côté navigateur, un plafond par IP.
 *
 * Deux niveaux :
 * - `Quota`, en mémoire : un premier filtre bon marché, propre à l'instance. Sa mémoire est
 *   bornée : si trop de clés sont suivies, les nouvelles sont refusées (on échoue fermé plutôt que
 *   de laisser grossir la table) ;
 * - `QuotaEnBase` : le plafond réel, partagé par toutes les instances (Workers, conteneurs
 *   multiples), tenu dans `vigie_fenetre` par une instruction atomique.
 */

import type { Base, Instruction } from "./base.ts";

const FENETRE_MS = 60_000;
const CLES_MAX = 10_000;

export interface LimitesQuota {
  parMinute: number;
  parMinuteEtParCle: number;
}

export const QUOTA_PAR_DEFAUT: LimitesQuota = { parMinute: 60, parMinuteEtParCle: 10 };

export type Decision = { accepte: true } | { accepte: false; reessayerDansSecondes: number };

interface Compteur {
  debut: number;
  compte: number;
}

export class Quota {
  private global: Compteur = { debut: 0, compte: 0 };
  private readonly parCle = new Map<string, Compteur>();
  private readonly limites: LimitesQuota;
  private readonly maintenant: () => number;

  constructor(limites: LimitesQuota = QUOTA_PAR_DEFAUT, maintenant: () => number = Date.now) {
    this.limites = limites;
    this.maintenant = maintenant;
  }

  /** Compte une tentative ; `cle` absente = seul le plafond global s'applique (côté serveur). */
  verifier(cle?: string): Decision {
    const instant = this.maintenant();
    if (instant - this.global.debut >= FENETRE_MS) {
      this.global = { debut: instant, compte: 0 };
    }

    let compteur: Compteur | undefined;
    if (cle !== undefined) {
      compteur = this.parCle.get(cle);
      if (compteur === undefined || instant - compteur.debut >= FENETRE_MS) {
        if (compteur === undefined && this.parCle.size >= CLES_MAX) {
          this.oublierLesAnciennes(instant);
          if (this.parCle.size >= CLES_MAX) {
            return this.refus(this.global, instant);
          }
        }
        compteur = { debut: instant, compte: 0 };
        this.parCle.set(cle, compteur);
      }
      if (compteur.compte >= this.limites.parMinuteEtParCle) {
        return this.refus(compteur, instant);
      }
    }

    if (this.global.compte >= this.limites.parMinute) {
      return this.refus(this.global, instant);
    }
    this.global.compte++;
    if (compteur !== undefined) {
      compteur.compte++;
    }
    return { accepte: true };
  }

  private refus(compteur: Compteur, instant: number): Decision {
    const resteMs = Math.max(compteur.debut + FENETRE_MS - instant, 0);
    return { accepte: false, reessayerDansSecondes: Math.max(Math.ceil(resteMs / 1000), 1) };
  }

  private oublierLesAnciennes(instant: number): void {
    for (const [cle, compteur] of this.parCle) {
      if (instant - compteur.debut >= FENETRE_MS) {
        this.parCle.delete(cle);
      }
    }
  }
}

// --- Quota en base, partagé par les instances ------------------------------------------------

export interface PlafondsQuota {
  serveur: { parMinute: number };
  navigateur: { parMinute: number; parMinuteEtParIp: number };
}

/** Une unité de plus dans la fenêtre, seulement sous le plafond : une ligne modifiée = accepté. */
function accepter(portee: string, cle: string, minute: number, plafond: number): Instruction {
  return {
    sql: `INSERT INTO vigie_fenetre (portee, cle, debut, compte) VALUES (?, ?, ?, 1)
          ON CONFLICT (portee, cle, debut) DO UPDATE SET compte = vigie_fenetre.compte + 1
          WHERE vigie_fenetre.compte < ?`,
    params: [portee, cle, minute, plafond],
  };
}

export class QuotaEnBase {
  private readonly base: Base;
  private readonly plafonds: PlafondsQuota;
  private readonly sel: () => Promise<string>;

  constructor(base: Base, plafonds: PlafondsQuota, sel: () => Promise<string>) {
    this.base = base;
    this.plafonds = plafonds;
    this.sel = sel;
  }

  /**
   * Le plafond global d'abord : sous une attaque à IP nombreuses, il borne le nombre de lignes
   * créées par minute. Si l'IP est ensuite refusée, l'unité globale est rendue.
   */
  async verifier(provenance: "serveur" | "navigateur", ip: string | undefined, instant: number): Promise<Decision> {
    const minute = Math.floor(instant / FENETRE_MS);
    const reessayer = Math.max(Math.ceil(((minute + 1) * FENETRE_MS - instant) / 1000), 1);
    const refus: Decision = { accepte: false, reessayerDansSecondes: reessayer };
    const global = this.plafonds[provenance].parMinute;
    const [accepte = 0] = await this.base.lot([accepter(provenance, "*", minute, global)]);
    if (accepte === 0) {
      return refus;
    }
    if (provenance === "navigateur") {
      const cle = await this.hacher(ip ?? "inconnue");
      const [parIp = 0] = await this.base.lot([accepter(provenance, cle, minute, this.plafonds.navigateur.parMinuteEtParIp)]);
      if (parIp === 0) {
        await this.base.lot([
          {
            sql: "UPDATE vigie_fenetre SET compte = compte - 1 WHERE portee = ? AND cle = '*' AND debut = ? AND compte > 0",
            params: [provenance, minute],
          },
        ]);
        return refus;
      }
    }
    return { accepte: true };
  }

  /** Les fenêtres de plus de deux minutes ne servent plus. */
  async purger(instant: number): Promise<void> {
    await this.base.lot([{ sql: "DELETE FROM vigie_fenetre WHERE debut < ?", params: [Math.floor(instant / FENETRE_MS) - 2] }]);
  }

  /** L'IP n'est jamais stockée en clair : SHA-256 du sel de l'application et de l'IP. */
  private async hacher(ip: string): Promise<string> {
    const octets = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${await this.sel()}:${ip}`));
    return Array.from(new Uint8Array(octets).slice(0, 16), (octet) => octet.toString(16).padStart(2, "0")).join("");
  }
}

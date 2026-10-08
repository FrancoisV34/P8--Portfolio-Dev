/**
 * Quota en mémoire (ADR-0006) : protège la base de production d'une tempête d'erreurs ou de faux
 * envois. Fenêtre fixe d'une minute, un plafond global et un plafond par clé (l'IP, côté
 * navigateur). La mémoire est bornée : si trop de clés sont suivies, les nouvelles sont refusées
 * (on échoue fermé plutôt que de laisser grossir la table).
 *
 * Le compte vit dans le processus : avec plusieurs instances (Workers), le plafond réel est
 * multiplié par le nombre d'instances. Accepté : c'est un garde-fou, pas une facturation.
 */

const FENETRE_MS = 60_000;
const CLES_MAX = 10_000;

export interface LimitesQuota {
  parMinute: number;
  parMinuteEtParCle: number;
}

export const LIMITES_PAR_DEFAUT: LimitesQuota = { parMinute: 60, parMinuteEtParCle: 10 };

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

  constructor(limites: LimitesQuota = LIMITES_PAR_DEFAUT, maintenant: () => number = Date.now) {
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

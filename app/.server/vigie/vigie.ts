/**
 * Le chemin d'une erreur : quota (mémoire puis base) → nettoyage et réduction → symbolisation
 * (navigateur) → empreinte → place dans le budget → stockage (ADR-0011).
 *
 * `capturer` ne lève jamais : un suivi d'erreurs qui fait tomber l'application qu'il surveille
 * serait pire que rien. Un échec est compté (`erreurs_internes`) et signalé au journal, au plus une
 * ligne par minute et sans aucune donnée de l'événement.
 */

import type { Base } from "./base.ts";
import { calculerEmpreinte } from "./empreinte.ts";
import { estObjet, type Objet } from "./json.ts";
import { completerLimites, type Limites, type LimitesPartielles } from "./limites.ts";
import { borner, nettoyer, octetsJson } from "./nettoyage.ts";
import { Quota, QuotaEnBase } from "./quota.ts";
import {
  ajouterCompteurs,
  enregistrer,
  faireDeLaPlace,
  jourDe,
  LOTS_PAR_APPEL,
  preparerEtat,
  purger,
  RETENTION_JOURS,
  type Ecriture,
  type PlafondsStockage,
  type Provenance,
} from "./stockage.ts";

/**
 * Ménage complet, pour une tâche planifiée (`purgeAutomatique: false`) : événements plus vieux que
 * la rétention et fenêtres de quota expirées. Renvoie le nombre d'événements supprimés.
 */
export async function menage(base: Base, maintenant: number, retentionJours = RETENTION_JOURS): Promise<number> {
  await base.lot([{ sql: "DELETE FROM vigie_fenetre WHERE debut < ?", params: [Math.floor(maintenant / 60_000) - 2] }]);
  return purger(base, maintenant, retentionJours);
}

const PURGE_TOUTES_LES_MS = 3600_000;
const FENETRES_PURGEES_TOUTES_LES_MS = 60_000;
const COMPTEURS_ECRITS_TOUTES_LES_MS = 10_000;
const ESPACE_VERIFIE_TOUTES_LES_MS = 60_000;
const JOURNAL_AU_PLUS_TOUTES_LES_MS = 60_000;
/** Sous cette part d'espace libre, seuls les compteurs sont tenus (ADR-0011, E9). */
export const ESPACE_LIBRE_MIN = 0.1;

export type Motif =
  | "refus_quota_serveur"
  | "refus_quota_navigateur"
  | "refus_taille"
  | "refus_cle"
  | "refus_origine"
  | "debordement_issues"
  | "evenements_reduits"
  | "evictions_budget"
  | "erreurs_internes";

export interface OptionsVigie {
  base: Base;
  limites?: LimitesPartielles;
  maintenant?: () => number;
  journal?: (ligne: string) => void;
  /** Symbolisation des erreurs du navigateur (`creerSymboliseur`), appliquée après le nettoyage. */
  symboliser?: (evenement: Objet) => Promise<Objet>;
  /** Pour un hôte qui a un disque (P8) : octets libres et total du volume de la base. */
  espaceLibre?: () => Promise<{ libres: number; total: number } | undefined>;
  /**
   * Purge de la rétention et des fenêtres de quota pendant les écritures (défaut : oui, par petits
   * lots). `false` : l'application appelle `menage(base, Date.now())` depuis une tâche planifiée
   * (Workers : `scheduled`), pour ne jamais alourdir une requête ordinaire.
   */
  purgeAutomatique?: boolean;
}

export interface OptionsCapture {
  provenance: Provenance;
  /** Clé du quota par client : l'IP côté navigateur ; ignorée côté serveur. */
  cleQuota?: string;
}

export type Resultat =
  | { statut: Ecriture; empreinte: string }
  | { statut: "quota"; reessayerDansSecondes: number }
  | { statut: "erreur" };

export interface Vigie {
  capturer(evenement: Objet, options: OptionsCapture): Promise<Resultat>;
  /** Compte un refus du point d'entrée (taille, clé, origine) ; ne lève jamais. */
  compter(motif: Motif): Promise<void>;
  readonly limites: Limites;
}

export function creerVigie(options: OptionsVigie): Vigie {
  const limites = completerLimites(options.limites);
  const { base } = options;
  const maintenant = options.maintenant ?? Date.now;
  const ecrire = options.journal ?? ((ligne: string) => console.error(ligne));

  let dernierJournal = -Infinity;
  function journal(ligne: string): void {
    const instant = maintenant();
    if (instant - dernierJournal >= JOURNAL_AU_PLUS_TOUTES_LES_MS) {
      dernierJournal = instant;
      ecrire(ligne);
    }
  }

  // Sel des IP et état de la base : préparés une fois, de nouveau après un échec.
  let preparation: Promise<string> | undefined;
  function sel(): Promise<string> {
    preparation ??= preparerEtat(base, limites.budgetOctets).catch((erreur: unknown) => {
      preparation = undefined;
      throw erreur;
    });
    return preparation;
  }

  const enMemoire = {
    serveur: new Quota({ parMinute: limites.quotas.serveur.parMinute, parMinuteEtParCle: limites.quotas.serveur.parMinute }, maintenant),
    navigateur: new Quota(
      { parMinute: limites.quotas.navigateur.parMinute, parMinuteEtParCle: limites.quotas.navigateur.parMinuteEtParIp },
      maintenant,
    ),
  };
  const enBase = new QuotaEnBase(base, limites.quotas, sel);

  // Compteurs : cumulés en mémoire, écrits au plus toutes les 10 s, pour qu'une attaque ne se
  // transforme pas en autant d'écritures.
  const enAttente = new Map<string, number>();
  let derniereEcritureCompteurs = -Infinity;
  function ajouter(motif: Motif, nombre = 1): void {
    enAttente.set(motif, (enAttente.get(motif) ?? 0) + nombre);
  }
  async function ecrireCompteurs(instant: number): Promise<void> {
    if (enAttente.size === 0 || instant - derniereEcritureCompteurs < COMPTEURS_ECRITS_TOUTES_LES_MS) {
      return;
    }
    derniereEcritureCompteurs = instant;
    const lot = new Map(enAttente);
    enAttente.clear();
    try {
      await ajouterCompteurs(base, jourDe(instant), lot);
    } catch {
      // La base est indisponible : on garde les incréments pour la prochaine fois.
      for (const [motif, nombre] of lot) {
        enAttente.set(motif, (enAttente.get(motif) ?? 0) + nombre);
      }
    }
  }

  let espace = { verifieA: -Infinity, details: true };
  async function detailsPermis(instant: number): Promise<boolean> {
    if (options.espaceLibre === undefined) {
      return true;
    }
    if (instant - espace.verifieA >= ESPACE_VERIFIE_TOUTES_LES_MS) {
      let details: boolean;
      try {
        const mesure = await options.espaceLibre();
        details = mesure === undefined || mesure.total <= 0 || mesure.libres / mesure.total >= ESPACE_LIBRE_MIN;
      } catch {
        details = true;
      }
      espace = { verifieA: instant, details };
    }
    return espace.details;
  }

  let dernierePurge = -Infinity;
  let dernierePurgeFenetres = -Infinity;
  async function menageAutomatique(instant: number): Promise<void> {
    if (options.purgeAutomatique === false) {
      return;
    }
    if (instant - dernierePurgeFenetres >= FENETRES_PURGEES_TOUTES_LES_MS) {
      dernierePurgeFenetres = instant;
      await enBase.purger(instant).catch(() => journal("vigie: purge des fenêtres de quota impossible"));
    }
    if (instant - dernierePurge >= PURGE_TOUTES_LES_MS) {
      dernierePurge = instant;
      await purger(base, instant, limites.retentionJours, LOTS_PAR_APPEL).catch(() => journal("vigie: purge impossible"));
    }
  }

  async function refuser(provenance: Provenance, instant: number, reessayerDansSecondes: number): Promise<Resultat> {
    ajouter(provenance === "serveur" ? "refus_quota_serveur" : "refus_quota_navigateur");
    await ecrireCompteurs(instant);
    journal(`vigie: quota ${provenance} dépassé, erreurs non stockées`);
    return { statut: "quota", reessayerDansSecondes };
  }

  return {
    limites,

    async capturer(evenement, { provenance, cleQuota }) {
      let empreinte = "?";
      try {
        const instant = maintenant();
        const ip = provenance === "navigateur" ? (cleQuota ?? "inconnue") : undefined;
        const memoire = enMemoire[provenance].verifier(ip);
        if (!memoire.accepte) {
          return await refuser(provenance, instant, memoire.reessayerDansSecondes);
        }
        await sel();
        const partage = await enBase.verifier(provenance, ip, instant);
        if (!partage.accepte) {
          return await refuser(provenance, instant, partage.reessayerDansSecondes);
        }

        const nettoye = nettoyer(evenement, limites.evenementOctetsMax);
        const propre =
          options.symboliser === undefined ? nettoye : borner(await options.symboliser(nettoye), limites.evenementOctetsMax);
        if (estObjet(propre["_vigie"])) {
          ajouter("evenements_reduits");
        }
        const calcul = await calculerEmpreinte(propre);
        empreinte = calcul.empreinte;

        const details = await detailsPermis(instant);
        if (details) {
          const evinces = await faireDeLaPlace(base, octetsJson(propre), limites.budgetOctets);
          if (evinces > 0) {
            ajouter("evictions_budget", evinces);
          }
        }
        const plafonds: PlafondsStockage = {
          budgetOctets: limites.budgetOctets,
          issuesMax: limites.issuesMax,
          nouvellesIssuesNavigateurParHeure: limites.nouvellesIssuesNavigateurParHeure,
          details,
        };
        let statut: Ecriture;
        try {
          statut = await enregistrer(base, propre, calcul, provenance, instant, plafonds);
        } catch (erreur) {
          if (!details) {
            throw erreur;
          }
          // Le détail n'a pas pu être écrit (ligne refusée par la base, par exemple) : l'issue et
          // son compteur passent quand même, sans détail. Le compteur ne dépend jamais du détail.
          statut = await enregistrer(base, propre, calcul, provenance, instant, { ...plafonds, details: false });
          ajouter("erreurs_internes");
          journal(`vigie: détail non stocké, erreur seulement comptée (empreinte ${empreinte})`);
        }

        await menageAutomatique(instant);
        await ecrireCompteurs(instant);
        return { statut, empreinte };
      } catch {
        // Le message de l'exception pourrait contenir des données de l'événement : on ne le
        // journalise pas.
        ajouter("erreurs_internes");
        journal(`vigie: erreur non stockée (empreinte ${empreinte})`);
        return { statut: "erreur" };
      }
    },

    async compter(motif) {
      try {
        ajouter(motif);
        await ecrireCompteurs(maintenant());
      } catch {
        // Jamais d'exception vers l'application.
      }
    },
  };
}

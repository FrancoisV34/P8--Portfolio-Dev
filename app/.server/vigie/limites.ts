/**
 * Limites de Vigie, réglables par l'application hôte (ADR-0011). Les défauts protègent une
 * application qui ne configure rien ; une valeur absurde fait échouer `creerVigie` au démarrage.
 */

import { EVENEMENT_OCTETS_MAX } from "./nettoyage.ts";

export interface Limites {
  /** Taille maximale d'un événement stocké (octets UTF-8 de son JSON). */
  evenementOctetsMax: number;
  /** Budget des détails stockés (somme des tailles des événements), en octets. */
  budgetOctets: number;
  /** Durée de conservation des détails ; issues et compteurs restent. */
  retentionJours: number;
  /** Nombre maximal d'issues (hors débordement). */
  issuesMax: number;
  nouvellesIssuesNavigateurParHeure: number;
  quotas: {
    serveur: { parMinute: number };
    navigateur: { parMinute: number; parMinuteEtParIp: number };
  };
}

export interface LimitesPartielles {
  evenementOctetsMax?: number;
  budgetOctets?: number;
  retentionJours?: number;
  issuesMax?: number;
  nouvellesIssuesNavigateurParHeure?: number;
  quotas?: {
    serveur?: { parMinute?: number };
    navigateur?: { parMinute?: number; parMinuteEtParIp?: number };
  };
}

export const LIMITES_PAR_DEFAUT: Limites = {
  evenementOctetsMax: EVENEMENT_OCTETS_MAX,
  budgetOctets: 20_000_000,
  retentionJours: 30,
  issuesMax: 2000,
  nouvellesIssuesNavigateurParHeure: 20,
  quotas: { serveur: { parMinute: 60 }, navigateur: { parMinute: 60, parMinuteEtParIp: 10 } },
};

/** En deçà, le squelette minimal d'un événement pourrait ne pas tenir. */
export const EVENEMENT_OCTETS_MIN = 16_384;

function entierPositif(nom: string, valeur: number): number {
  if (!Number.isSafeInteger(valeur) || valeur < 1) {
    throw new Error(`vigie: limite invalide : ${nom} doit être un entier positif`);
  }
  return valeur;
}

/** Complète les limites fournies par les défauts, puis les vérifie. */
export function completerLimites(fournies: LimitesPartielles = {}): Limites {
  const d = LIMITES_PAR_DEFAUT;
  const limites: Limites = {
    evenementOctetsMax: entierPositif("evenementOctetsMax", fournies.evenementOctetsMax ?? d.evenementOctetsMax),
    budgetOctets: entierPositif("budgetOctets", fournies.budgetOctets ?? d.budgetOctets),
    retentionJours: entierPositif("retentionJours", fournies.retentionJours ?? d.retentionJours),
    issuesMax: entierPositif("issuesMax", fournies.issuesMax ?? d.issuesMax),
    nouvellesIssuesNavigateurParHeure: entierPositif(
      "nouvellesIssuesNavigateurParHeure",
      fournies.nouvellesIssuesNavigateurParHeure ?? d.nouvellesIssuesNavigateurParHeure,
    ),
    quotas: {
      serveur: {
        parMinute: entierPositif("quotas.serveur.parMinute", fournies.quotas?.serveur?.parMinute ?? d.quotas.serveur.parMinute),
      },
      navigateur: {
        parMinute: entierPositif(
          "quotas.navigateur.parMinute",
          fournies.quotas?.navigateur?.parMinute ?? d.quotas.navigateur.parMinute,
        ),
        parMinuteEtParIp: entierPositif(
          "quotas.navigateur.parMinuteEtParIp",
          fournies.quotas?.navigateur?.parMinuteEtParIp ?? d.quotas.navigateur.parMinuteEtParIp,
        ),
      },
    },
  };
  if (limites.evenementOctetsMax < EVENEMENT_OCTETS_MIN) {
    throw new Error(`vigie: limite invalide : evenementOctetsMax doit valoir au moins ${EVENEMENT_OCTETS_MIN}`);
  }
  if (limites.budgetOctets < 2 * limites.evenementOctetsMax) {
    throw new Error("vigie: limite invalide : budgetOctets doit valoir au moins deux fois evenementOctetsMax");
  }
  return limites;
}

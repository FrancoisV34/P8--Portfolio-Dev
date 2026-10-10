/**
 * Vigie : suivi d'erreurs embarqué, installé dans l'application qu'il surveille (ADR-0002).
 * Une seule implémentation pour P8 (Node) et site_factory (Workers) : le cœur ne dépend d'aucune
 * API propre à Node (voir `plateforme.d.ts`).
 */
export const NOM = "vigie";

export { calculerEmpreinte, normaliserChemin, normaliserMessage, type Empreinte } from "./empreinte.ts";
export type { Json, Objet } from "./json.ts";
export { MASQUE, nettoyer, nettoyerTexte, nomSensible, tronquerIp } from "./nettoyage.ts";
export { baseBetterSqlite3, baseD1, type Base, type BetterSqlite3, type D1, type Ligne, type Valeur } from "./base.ts";
export { LIMITES_PAR_DEFAUT, Quota, type LimitesQuota } from "./quota.ts";
export { enregistrer, purger, type Provenance } from "./stockage.ts";
export { creerVigie, type OptionsCapture, type OptionsVigie, type Resultat, type Vigie } from "./vigie.ts";
export { DSN_LOCAL, evenementsDeLEnveloppe, transportVigie, type TransportSentry } from "./transport.ts";
export { lireEnveloppe, type Enveloppe } from "./enveloppe.ts";
export { creerPointEntree, TAILLE_DECOMPRESSEE_MAX, TAILLE_MAX, type OptionsPointEntree } from "./navigateur.ts";
export { creerSymboliseur, type LireCarte } from "./symbolisation.ts";
export { AVERTISSEMENT, creerConsultation, echapper, jetonValide, type OptionsConsultation } from "./consultation.ts";
export { changerStatut, lireIssue, listerIssues, resume, type Issue, type Statut } from "./lecture.ts";

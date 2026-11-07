/**
 * Écriture et ménage dans la base de l'application (ADR-0006, ADR-0011).
 *
 * Une erreur = un lot atomique de cinq instructions, dont chacune porte ses propres conditions (D1
 * n'a pas de transaction interactive) :
 * 1. l'issue est créée ou mise à jour (compteur exact, dernière apparition, réouverture) — une
 *    nouvelle issue seulement sous les plafonds d'issues (les issues de débordement comptent dans
 *    le total : c'est plus strict, et un simple `count(*)` reste rapide) ;
 * 2. sinon, l'occurrence est comptée dans l'issue « Débordement » du jour (3 : et dans le compteur
 *    `debordement_issues`), sans aucun détail ;
 * 4. l'ancienne « dernière occurrence » de l'issue est retirée…
 * 5. … et l'événement est conservé : échantillon (occurrences 1 à 5, puis chaque puissance de 10)
 *    ou nouvelle « dernière occurrence ». Seulement si le budget d'octets le permet, vérifié dans
 *    l'instruction même : il n'est jamais dépassé, même avec plusieurs instances.
 * Le total des octets stockés est tenu par des triggers SQL (`sql/0002_vigie.sql`), atomiques avec
 * chaque insertion ou suppression d'événement. Un événement déjà vu (même `event_id`, renvoi du
 * SDK) ne compte pas deux fois.
 */

import type { Base } from "./base.ts";
import type { Empreinte } from "./empreinte.ts";
import { derniereException, messageDe } from "./evenement.ts";
import { estObjet, texte, type Json, type Objet } from "./json.ts";
import { LIMITES_PAR_DEFAUT } from "./limites.ts";

export const RETENTION_JOURS = 30;
export const PREMIERS_ECHANTILLONS = 5;
/** Éviction jusqu'à 90 % du budget : on ne recommence pas à chaque écriture. */
export const HYSTERESIS = 0.9;
const LONGUEUR_TITRE = 200;
const LOT_PURGE = 500;
const LOT_EVICTION = 500;
/** Lots au plus par appel pour le ménage fait pendant une écriture (purge, éviction) : une requête
 * ordinaire ne doit pas épuiser les limites de l'appel (Workers). */
export const LOTS_PAR_APPEL = 10;

export type Provenance = "serveur" | "navigateur";
export type Ecriture = "stocke" | "compte" | "doublon" | "deborde";

export interface PlafondsStockage {
  budgetOctets: number;
  issuesMax: number;
  nouvellesIssuesNavigateurParHeure: number;
  /** Faux : seuls les compteurs sont tenus, sans détail (disque presque plein, ADR-0011 E9). */
  details: boolean;
}

export const PLAFONDS_PAR_DEFAUT: PlafondsStockage = {
  budgetOctets: LIMITES_PAR_DEFAUT.budgetOctets,
  issuesMax: LIMITES_PAR_DEFAUT.issuesMax,
  nouvellesIssuesNavigateurParHeure: LIMITES_PAR_DEFAUT.nouvellesIssuesNavigateurParHeure,
  details: true,
};

// Échantillon : occurrences 1 à 5, puis 10, 100, 1 000… (jusqu'à 10¹⁵, bien au-delà du réel).
const PUISSANCES_DE_DIX = Array.from({ length: 15 }, (_, i) => `1${"0".repeat(i + 1)}`).join(", ");
const ECHANTILLON = `(i.nb_occurrences <= ${PREMIERS_ECHANTILLONS} OR i.nb_occurrences IN (${PUISSANCES_DE_DIX}))`;

function couper(valeur: string, longueur: number): string {
  return Array.from(valeur).slice(0, longueur).join("");
}

function titre(evenement: Objet): string {
  const exception = derniereException(evenement);
  if (exception !== undefined) {
    const type = texte(exception["type"]) ?? "Error";
    const valeur = texte(exception["value"]);
    return couper(valeur === undefined || valeur === "" ? type : `${type}: ${valeur}`, LONGUEUR_TITRE);
  }
  const message = messageDe(evenement, false);
  return couper(message ?? "(sans message)", LONGUEUR_TITRE);
}

/** L'endroit du code en cause : la frame de l'application la plus proche de l'erreur. */
function lieu(evenement: Objet): string | null {
  const exception = derniereException(evenement);
  const pile = exception === undefined ? undefined : exception["stacktrace"];
  const frames: Json[] = estObjet(pile) && Array.isArray(pile["frames"]) ? pile["frames"] : [];
  const objets = frames.filter(estObjet);
  const frame = objets.filter((candidate) => candidate["in_app"] === true).at(-1) ?? objets.at(-1);
  if (frame === undefined) {
    const transaction = texte(evenement["transaction"]);
    return transaction === undefined ? null : couper(transaction, LONGUEUR_TITRE);
  }
  const ou = texte(frame["module"]) ?? texte(frame["filename"]) ?? "?";
  return couper(`${ou}:${texte(frame["function"]) ?? "?"}`, LONGUEUR_TITRE);
}

function identifiantUtilisateur(evenement: Objet): string | null {
  const utilisateur = evenement["user"];
  const id = estObjet(utilisateur) ? utilisateur["id"] : undefined;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

function texteBorne(valeur: Json | undefined): string | null {
  const lu = texte(valeur);
  return lu === undefined ? null : couper(lu, LONGUEUR_TITRE);
}

/** `AAAA-MM-JJ` (UTC) : la clé des compteurs et des issues de débordement. */
export function jourDe(instant: number): string {
  return new Date(instant).toISOString().slice(0, 10);
}

// Réouverture (cadrage, sujet 5 ; ADR-0009) : une issue résolue revient à traiter si l'erreur
// réapparaît sans release, ou dans une autre release que celle où elle a été résolue.
const REOUVRIR = `vigie_issue.statut = 'resolue' AND (excluded.derniere_release IS NULL
    OR vigie_issue.resolue_dans_release IS NULL
    OR excluded.derniere_release <> vigie_issue.resolue_dans_release)`;

const MISE_A_JOUR_ISSUE = `ON CONFLICT (empreinte) DO UPDATE SET
  derniere_apparition = excluded.derniere_apparition,
  derniere_release = COALESCE(excluded.derniere_release, vigie_issue.derniere_release),
  nb_occurrences = vigie_issue.nb_occurrences + 1,
  statut = CASE WHEN ${REOUVRIR} THEN 'a_traiter' ELSE vigie_issue.statut END,
  resolue_dans_release = CASE WHEN ${REOUVRIR} THEN NULL ELSE vigie_issue.resolue_dans_release END`;

const PAS_ENCORE_VU = "NOT EXISTS (SELECT 1 FROM vigie_event WHERE event_id = ?)";
const OCTETS = "(SELECT nombre FROM vigie_etat WHERE cle = 'octets')";

/** Enregistre un événement **déjà nettoyé** et son empreinte. */
export async function enregistrer(
  base: Base,
  evenement: Objet,
  empreinte: Empreinte,
  provenance: Provenance,
  maintenant: number,
  plafonds: PlafondsStockage = PLAFONDS_PAR_DEFAUT,
): Promise<Ecriture> {
  const eventId = texte(evenement["event_id"]) ?? crypto.randomUUID().replace(/-/g, "");
  const quand = new Date(maintenant).toISOString();
  const ilYaUneHeure = new Date(maintenant - 3600_000).toISOString();
  const release = texteBorne(evenement["release"]);
  const niveau = texteBorne(evenement["level"]) ?? "error";
  const details = plafonds.details ? 1 : 0;
  // Sans détail (repli, disque presque plein), le contenu n'est même pas envoyé à la base.
  const contenu = details === 1 ? JSON.stringify(evenement) : "{}";
  const taille = details === 1 ? new TextEncoder().encode(contenu).length : 0;
  const debordement = `debordement:${provenance}:${jourDe(maintenant)}`;
  const titreDebordement = `Débordement (${provenance}) : erreurs comptées au-delà du plafond d'issues`;
  const issueDeLEmpreinte = "(SELECT id FROM vigie_issue WHERE empreinte = ?)";

  const [issue = 0, deborde = 0, , , conserve = 0] = await base.lot([
    {
      sql: `INSERT INTO vigie_issue (empreinte, regle, titre, lieu, niveau, premiere_apparition,
              derniere_apparition, premiere_release, derniere_release, provenance)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE ${PAS_ENCORE_VU}
              AND (EXISTS (SELECT 1 FROM vigie_issue WHERE empreinte = ?)
                OR ((SELECT count(*) FROM vigie_issue) < ?
                  AND (? <> 'navigateur'
                    OR (SELECT count(*) FROM vigie_issue WHERE provenance = 'navigateur'
                          AND regle <> 'debordement' AND premiere_apparition >= ?) < ?)))
            ${MISE_A_JOUR_ISSUE}`,
      params: [
        empreinte.empreinte,
        empreinte.regle,
        titre(evenement),
        lieu(evenement),
        niveau,
        quand,
        quand,
        release,
        release,
        provenance,
        eventId,
        empreinte.empreinte,
        plafonds.issuesMax,
        provenance,
        ilYaUneHeure,
        plafonds.nouvellesIssuesNavigateurParHeure,
      ],
    },
    {
      sql: `INSERT INTO vigie_issue (empreinte, regle, titre, lieu, niveau, premiere_apparition,
              derniere_apparition, premiere_release, derniere_release, provenance)
            SELECT ?, 'debordement', ?, NULL, 'warning', ?, ?, ?, ?, ?
            WHERE ${PAS_ENCORE_VU} AND NOT EXISTS (SELECT 1 FROM vigie_issue WHERE empreinte = ?)
            ${MISE_A_JOUR_ISSUE}`,
      params: [debordement, titreDebordement, quand, quand, release, release, provenance, eventId, empreinte.empreinte],
    },
    {
      sql: `INSERT INTO vigie_compteur (jour, motif, compte)
            SELECT ?, 'debordement_issues', 1
            WHERE ${PAS_ENCORE_VU} AND NOT EXISTS (SELECT 1 FROM vigie_issue WHERE empreinte = ?)
            ON CONFLICT (jour, motif) DO UPDATE SET compte = vigie_compteur.compte + 1`,
      params: [jourDe(maintenant), eventId, empreinte.empreinte],
    },
    {
      sql: `DELETE FROM vigie_event
            WHERE role = 'derniere' AND issue_id = ${issueDeLEmpreinte} AND ? = 1 AND ${PAS_ENCORE_VU}
              AND ${OCTETS} - (SELECT COALESCE(sum(taille), 0) FROM vigie_event
                               WHERE role = 'derniere' AND issue_id = ${issueDeLEmpreinte}) + ? <= ?`,
      params: [empreinte.empreinte, details, eventId, empreinte.empreinte, taille, plafonds.budgetOctets],
    },
    {
      sql: `INSERT INTO vigie_event (event_id, issue_id, recu_le, release_vue, environnement,
              provenance, utilisateur, contenu, taille, role)
            SELECT ?, i.id, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ${ECHANTILLON} THEN 'echantillon' ELSE 'derniere' END
            FROM vigie_issue i
            WHERE i.empreinte = ? AND ? = 1 AND ${PAS_ENCORE_VU} AND ${OCTETS} + ? <= ?
            ON CONFLICT (event_id) DO NOTHING`,
      params: [
        eventId,
        quand,
        release,
        texteBorne(evenement["environment"]),
        provenance,
        identifiantUtilisateur(evenement),
        contenu,
        taille,
        empreinte.empreinte,
        details,
        eventId,
        taille,
        plafonds.budgetOctets,
      ],
    },
  ]);

  if (deborde > 0) {
    return "deborde";
  }
  if (issue === 0) {
    return "doublon";
  }
  return conserve > 0 ? "stocke" : "compte";
}

/** Total des octets stockés (tenu par les triggers). */
export async function octetsStockes(base: Base): Promise<number> {
  const [ligne] = await base.lire("SELECT nombre FROM vigie_etat WHERE cle = 'octets'", []);
  return Number(ligne?.["nombre"] ?? 0);
}

/**
 * Évince les événements les plus anciens (la « dernière occurrence » de chaque issue en dernier)
 * jusqu'à ce que le total tombe à `cible` octets ou moins ; renvoie le nombre d'événements évincés.
 * Les issues et leurs compteurs ne sont jamais touchés.
 */
export async function evincer(base: Base, cible: number, lotsMax = 10_000): Promise<number> {
  let total = 0;
  for (let tour = 0; tour < lotsMax; tour++) {
    const exces = (await octetsStockes(base)) - cible;
    if (exces <= 0) {
      break;
    }
    // Le plus petit préfixe (dans l'ordre d'éviction) dont la taille couvre l'excès : on ne
    // supprime pas un événement de plus que nécessaire.
    const [supprimes = 0] = await base.lot([
      {
        sql: `DELETE FROM vigie_event WHERE id IN (
                SELECT id FROM (
                  SELECT id, taille, sum(taille) OVER (ORDER BY (role = 'derniere'), id) AS cumul
                  FROM vigie_event ORDER BY (role = 'derniere'), id LIMIT ${LOT_EVICTION}
                ) AS candidats WHERE cumul - taille < ?)`,
        params: [exces],
      },
    ]);
    total += supprimes;
    if (supprimes === 0) {
      break;
    }
  }
  return total;
}

/**
 * Avant d'écrire `taille` octets : évince si le budget serait dépassé (jusqu'à 90 % du budget), en
 * `lotsMax` lots au plus, pour rester dans les limites d'un appel (Workers : requêtes vers D1
 * comptées). Ce qui reste se fait aux écritures suivantes : le budget, lui, est vérifié à l'écriture.
 */
export async function faireDeLaPlace(base: Base, taille: number, budgetOctets: number, lotsMax = LOTS_PAR_APPEL): Promise<number> {
  if ((await octetsStockes(base)) + taille <= budgetOctets) {
    return 0;
  }
  return evincer(base, Math.max(Math.floor(budgetOctets * HYSTERESIS) - taille, 0), lotsMax);
}

/** Supprime les événements plus vieux que la rétention, par petits lots ; les issues restent. */
export async function purger(base: Base, maintenant: number, jours = RETENTION_JOURS, lotsMax = 1000): Promise<number> {
  const limite = new Date(maintenant - jours * 24 * 3600 * 1000).toISOString();
  let total = 0;
  for (let tour = 0; tour < lotsMax; tour++) {
    const [supprimes = 0] = await base.lot([
      {
        sql: `DELETE FROM vigie_event WHERE id IN
                (SELECT id FROM vigie_event WHERE recu_le < ? ORDER BY id LIMIT ${LOT_PURGE})`,
        params: [limite],
      },
    ]);
    total += supprimes;
    if (supprimes < LOT_PURGE) {
      break;
    }
  }
  return total;
}

/**
 * Prépare l'état de Vigie (idempotent, à chaque démarrage) : total des octets s'il manque, sel des
 * IP (tiré une fois pour toutes, partagé par les instances), budget affiché par le dashboard.
 * Renvoie le sel.
 */
export async function preparerEtat(base: Base, budgetOctets: number): Promise<string> {
  // UUID v4 : 122 bits aléatoires (générateur cryptographique), assez pour un sel.
  const sel = crypto.randomUUID().replace(/-/g, "");
  await base.lot([
    {
      sql: `INSERT INTO vigie_etat (cle, nombre)
            SELECT 'octets', COALESCE(sum(taille), 0) FROM vigie_event WHERE 1 = 1
            ON CONFLICT (cle) DO NOTHING`,
      params: [],
    },
    { sql: "INSERT INTO vigie_etat (cle, nombre, texte) VALUES ('sel', 0, ?) ON CONFLICT (cle) DO NOTHING", params: [sel] },
    {
      sql: "INSERT INTO vigie_etat (cle, nombre) VALUES ('budget', ?) ON CONFLICT (cle) DO UPDATE SET nombre = excluded.nombre",
      params: [budgetOctets],
    },
  ]);
  const [ligne] = await base.lire("SELECT texte FROM vigie_etat WHERE cle = 'sel'", []);
  const lu = ligne?.["texte"];
  if (typeof lu !== "string" || lu === "") {
    throw new Error("vigie: sel introuvable");
  }
  return lu;
}

/** Ajoute des incréments aux compteurs du jour (un seul lot). */
export async function ajouterCompteurs(base: Base, jour: string, increments: Map<string, number>): Promise<void> {
  if (increments.size === 0) {
    return;
  }
  await base.lot(
    [...increments].map(([motif, nombre]) => ({
      sql: `INSERT INTO vigie_compteur (jour, motif, compte) VALUES (?, ?, ?)
            ON CONFLICT (jour, motif) DO UPDATE SET compte = vigie_compteur.compte + excluded.compte`,
      params: [jour, motif, nombre],
    })),
  );
}

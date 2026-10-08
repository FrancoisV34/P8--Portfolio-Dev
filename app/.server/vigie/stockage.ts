/**
 * Écriture et ménage dans la base de l'application (ADR-0006).
 *
 * Une erreur = un lot atomique de deux instructions :
 * 1. l'issue est créée ou mise à jour (compteur exact, dernière apparition, réouverture) ;
 * 2. l'événement est conservé s'il passe l'échantillonnage : les 100 premiers, puis 1 sur 100,
 *    1 000 au plus par issue.
 * Un événement déjà conservé (même `event_id`, renvoi du SDK) ne compte pas deux fois.
 */

import type { Base } from "./base.ts";
import type { Empreinte } from "./empreinte.ts";
import { derniereException, messageDe } from "./evenement.ts";
import { estObjet, texte, type Json, type Objet } from "./json.ts";

export const PREMIERS_CONSERVES = 100;
export const UN_SUR = 100;
export const CONSERVES_MAX = 1000;
export const RETENTION_JOURS = 30;
const LONGUEUR_TITRE = 200;
const LOT_PURGE = 500;

export type Provenance = "serveur" | "navigateur";
export type Ecriture = "stocke" | "compte" | "doublon";

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
    return texte(evenement["transaction"]) ?? null;
  }
  const ou = texte(frame["module"]) ?? texte(frame["filename"]) ?? "?";
  return couper(`${ou}:${texte(frame["function"]) ?? "?"}`, LONGUEUR_TITRE);
}

function identifiantUtilisateur(evenement: Objet): string | null {
  const utilisateur = evenement["user"];
  const id = estObjet(utilisateur) ? utilisateur["id"] : undefined;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

/** Enregistre un événement **déjà nettoyé** et son empreinte. */
export async function enregistrer(
  base: Base,
  evenement: Objet,
  empreinte: Empreinte,
  provenance: Provenance,
  maintenant: number,
): Promise<Ecriture> {
  const eventId = texte(evenement["event_id"]) ?? crypto.randomUUID().replace(/-/g, "");
  const quand = new Date(maintenant).toISOString();
  const release = texte(evenement["release"]) ?? null;
  const niveau = texte(evenement["level"]) ?? "error";

  // Réouverture (cadrage, sujet 5 ; ADR-0009) : une issue résolue revient à traiter si l'erreur
  // réapparaît sans release, ou dans une autre release que celle où elle a été résolue.
  const reouvrir = `vigie_issue.statut = 'resolue' AND (excluded.derniere_release IS NULL
    OR vigie_issue.resolue_dans_release IS NULL
    OR excluded.derniere_release <> vigie_issue.resolue_dans_release)`;

  const [issue = 0, conserve = 0] = await base.lot([
    {
      sql: `INSERT INTO vigie_issue (empreinte, regle, titre, lieu, niveau, premiere_apparition,
              derniere_apparition, premiere_release, derniere_release)
            SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM vigie_event WHERE event_id = ?)
            ON CONFLICT (empreinte) DO UPDATE SET
              derniere_apparition = excluded.derniere_apparition,
              derniere_release = COALESCE(excluded.derniere_release, vigie_issue.derniere_release),
              nb_occurrences = vigie_issue.nb_occurrences + 1,
              statut = CASE WHEN ${reouvrir} THEN 'a_traiter' ELSE vigie_issue.statut END,
              resolue_dans_release = CASE WHEN ${reouvrir} THEN NULL
                ELSE vigie_issue.resolue_dans_release END`,
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
        eventId,
      ],
    },
    {
      sql: `INSERT INTO vigie_event (event_id, issue_id, recu_le, release_vue, environnement,
              provenance, utilisateur, contenu)
            SELECT ?, i.id, ?, ?, ?, ?, ?, ?
            FROM vigie_issue i
            WHERE i.empreinte = ?
              AND (i.nb_occurrences <= ${PREMIERS_CONSERVES}
                OR (i.nb_occurrences % ${UN_SUR} = 0
                  AND (SELECT count(*) FROM vigie_event e WHERE e.issue_id = i.id) < ${CONSERVES_MAX}))
              AND NOT EXISTS (SELECT 1 FROM vigie_event WHERE event_id = ?)
            ON CONFLICT (event_id) DO NOTHING`,
      params: [
        eventId,
        quand,
        release,
        texte(evenement["environment"]) ?? null,
        provenance,
        identifiantUtilisateur(evenement),
        JSON.stringify(evenement),
        empreinte.empreinte,
        eventId,
      ],
    },
  ]);

  if (issue === 0) {
    return "doublon";
  }
  return conserve > 0 ? "stocke" : "compte";
}

/** Supprime les événements plus vieux que la rétention, par petits lots ; les issues restent. */
export async function purger(base: Base, maintenant: number, jours = RETENTION_JOURS): Promise<number> {
  const limite = new Date(maintenant - jours * 24 * 3600 * 1000).toISOString();
  let total = 0;
  for (let tour = 0; tour < 1000; tour++) {
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

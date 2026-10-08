/**
 * Lecture des issues et changement de statut : les mêmes requêtes servent l'API des agents et le
 * dashboard (ADR-0003, ADR-0008). Tout paramètre est validé avant d'atteindre le SQL, et le SQL
 * n'est jamais construit avec une valeur reçue (paramètres `?` seulement).
 */

import type { Base, Ligne, Valeur } from "./base.ts";
import type { Json } from "./json.ts";

export type Statut = "a_traiter" | "resolue" | "ignoree";
export const STATUTS: readonly Statut[] = ["a_traiter", "resolue", "ignoree"];
const LIMITE_MAX = 100;
const EVENEMENTS_DETAIL = 10;

export interface Issue {
  id: number;
  statut: Statut;
  titre: string;
  lieu: string | null;
  niveau: string;
  regle: string;
  premiere_apparition: string;
  derniere_apparition: string;
  premiere_release: string | null;
  derniere_release: string | null;
  resolue_dans_release: string | null;
  nb_occurrences: number;
}

export interface Evenement {
  event_id: string;
  recu_le: string;
  release: string | null;
  environnement: string | null;
  provenance: string;
  contenu: Json;
}

export interface Filtres {
  statut?: Statut;
  depuis?: string;
  release?: string;
  recherche?: string;
  limite: number;
  curseur?: { derniere: string; id: number };
}

export class ParametreInvalide extends Error {}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z?)?$/;
const CURSEUR = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)_(\d{1,15})$/;

/** Filtres lus dans les paramètres d'URL ; une valeur invalide est refusée, jamais ignorée. */
export function lireFiltres(parametres: URLSearchParams): Filtres {
  const filtres: Filtres = { limite: 50 };
  const statut = parametres.get("statut");
  if (statut !== null) {
    if (!(STATUTS as readonly string[]).includes(statut)) {
      throw new ParametreInvalide("statut");
    }
    filtres.statut = statut as Statut;
  }
  const depuis = parametres.get("depuis");
  if (depuis !== null) {
    if (!DATE_ISO.test(depuis) || Number.isNaN(Date.parse(depuis))) {
      throw new ParametreInvalide("depuis");
    }
    filtres.depuis = new Date(depuis).toISOString();
  }
  const release = parametres.get("release");
  if (release !== null) {
    if (release.length === 0 || release.length > 200) {
      throw new ParametreInvalide("release");
    }
    filtres.release = release;
  }
  const recherche = parametres.get("q");
  if (recherche !== null && recherche !== "") {
    if (recherche.length > 200) {
      throw new ParametreInvalide("q");
    }
    filtres.recherche = recherche;
  }
  const limite = parametres.get("limite");
  if (limite !== null) {
    const nombre = Number(limite);
    if (!Number.isInteger(nombre) || nombre < 1 || nombre > LIMITE_MAX) {
      throw new ParametreInvalide("limite");
    }
    filtres.limite = nombre;
  }
  const curseur = parametres.get("curseur");
  if (curseur !== null) {
    const morceaux = CURSEUR.exec(curseur);
    if (morceaux === null) {
      throw new ParametreInvalide("curseur");
    }
    filtres.curseur = { derniere: morceaux[1]!, id: Number(morceaux[2]) };
  }
  return filtres;
}

function enIssue(ligne: Ligne): Issue {
  return ligne as unknown as Issue;
}

/** Issues les plus récemment vues d'abord ; pagination par curseur (stable pendant l'écriture). */
export async function listerIssues(base: Base, filtres: Filtres): Promise<{ issues: Issue[]; suivant: string | null }> {
  const conditions: string[] = [];
  const params: Valeur[] = [];
  if (filtres.statut !== undefined) {
    conditions.push("statut = ?");
    params.push(filtres.statut);
  }
  if (filtres.depuis !== undefined) {
    conditions.push("derniere_apparition >= ?");
    params.push(filtres.depuis);
  }
  if (filtres.release !== undefined) {
    conditions.push("(derniere_release = ? OR premiere_release = ?)");
    params.push(filtres.release, filtres.release);
  }
  if (filtres.recherche !== undefined) {
    conditions.push("titre LIKE ? ESCAPE '\\'");
    params.push(`%${filtres.recherche.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  if (filtres.curseur !== undefined) {
    conditions.push("(derniere_apparition < ? OR (derniere_apparition = ? AND id < ?))");
    params.push(filtres.curseur.derniere, filtres.curseur.derniere, filtres.curseur.id);
  }
  const ou = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const lignes = await base.lire(
    `SELECT * FROM vigie_issue ${ou} ORDER BY derniere_apparition DESC, id DESC LIMIT ?`,
    [...params, filtres.limite + 1],
  );
  const issues = lignes.slice(0, filtres.limite).map(enIssue);
  const derniere = issues.at(-1);
  const suivant = lignes.length > filtres.limite && derniere !== undefined ? `${derniere.derniere_apparition}_${derniere.id}` : null;
  return { issues, suivant };
}

export async function lireIssue(
  base: Base,
  id: number,
): Promise<{ issue: Issue; evenements: Evenement[]; utilisateursTouches: number } | null> {
  const [ligne] = await base.lire("SELECT * FROM vigie_issue WHERE id = ?", [id]);
  if (ligne === undefined) {
    return null;
  }
  const lignes = await base.lire(
    `SELECT event_id, recu_le, release_vue, environnement, provenance, contenu FROM vigie_event
     WHERE issue_id = ? ORDER BY recu_le DESC, id DESC LIMIT ${EVENEMENTS_DETAIL}`,
    [id],
  );
  const [comptage] = await base.lire(
    "SELECT count(DISTINCT utilisateur) AS n FROM vigie_event WHERE issue_id = ? AND utilisateur IS NOT NULL",
    [id],
  );
  const evenements = lignes.map((e) => ({
    event_id: String(e["event_id"]),
    recu_le: String(e["recu_le"]),
    release: (e["release_vue"] as string | null) ?? null,
    environnement: (e["environnement"] as string | null) ?? null,
    provenance: String(e["provenance"]),
    contenu: JSON.parse(String(e["contenu"])) as Json,
  }));
  return { issue: enIssue(ligne), evenements, utilisateursTouches: Number(comptage?.["n"] ?? 0) };
}

export async function resume(base: Base, maintenant: number): Promise<Record<string, number | string | null>> {
  const hier = new Date(maintenant - 24 * 3600 * 1000).toISOString();
  const [ligne] = await base.lire(
    `SELECT
       (SELECT count(*) FROM vigie_issue WHERE statut = 'a_traiter') AS a_traiter,
       (SELECT count(*) FROM vigie_issue WHERE premiere_apparition >= ?) AS nouvelles_24h,
       (SELECT count(*) FROM vigie_issue WHERE derniere_apparition >= ?) AS actives_24h,
       (SELECT count(*) FROM vigie_issue) AS total,
       (SELECT derniere_release FROM vigie_issue WHERE derniere_release IS NOT NULL
          ORDER BY derniere_apparition DESC LIMIT 1) AS derniere_release`,
    [hier, hier],
  );
  return {
    a_traiter: Number(ligne?.["a_traiter"] ?? 0),
    nouvelles_24h: Number(ligne?.["nouvelles_24h"] ?? 0),
    actives_24h: Number(ligne?.["actives_24h"] ?? 0),
    total: Number(ligne?.["total"] ?? 0),
    derniere_release: (ligne?.["derniere_release"] as string | null | undefined) ?? null,
  };
}

/** Résoudre retient la release en cours : l'issue se rouvrira si l'erreur revient dans une autre. */
export async function changerStatut(base: Base, id: number, statut: Statut): Promise<boolean> {
  const [modifiees = 0] = await base.lot([
    {
      sql: `UPDATE vigie_issue SET statut = ?,
              resolue_dans_release = CASE WHEN ? = 'resolue' THEN derniere_release ELSE NULL END
            WHERE id = ?`,
      params: [statut, statut, id],
    },
  ]);
  return modifiees > 0;
}

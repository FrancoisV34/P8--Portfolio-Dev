/**
 * Symbolisation des erreurs du navigateur (ADR-0009) : les frames minifiées retrouvent leur
 * fichier, leur ligne et leur nom d'origine grâce aux source maps gardées **dans l'application**,
 * hors du dossier publié. Elle a lieu à la réception, après le nettoyage, avant l'empreinte.
 *
 * Nom d'une fonction : dans une source map, le nom attaché à la position d'une frame est celui de
 * ce qu'elle **appelle**. Le nom d'origine d'une frame se lit donc à la position de la frame qui
 * l'appelle (celle d'avant). À défaut : la partie après le dernier point du nom minifié (les
 * minifieurs ne renomment pas les propriétés, `ac.valider` → `valider`), sinon `?` — jamais un
 * nom minifié, qui change à chaque build.
 *
 * Une frame symbolisée reçoit `data.symbolise = true` ; elle est `in_app` si sa source d'origine
 * n'est pas dans `node_modules`. Une frame sans carte n'est pas `in_app` (script tiers, extension) :
 * si aucune frame n'est symbolisée, l'empreinte retombe sur la règle « exception » (ADR-0007).
 */

import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";

import { estObjet, texte, type Json, type Objet } from "./json.ts";

/** Fournie par l'application : le contenu d'une carte (`app-B4x9.js.map`), lu dans un dossier
 * fixe hors du dossier publié ; `undefined` si elle n'existe pas. */
export type LireCarte = (nom: string) => Promise<string | undefined>;

const CARTES_EN_MEMOIRE = 50;
const TAILLE_CARTE_MAX = 20_000_000;
// Un nom de fichier seul : ni dossier ni `..` ne peuvent atteindre `lireCarte`.
const NOM_DE_FICHIER = /^[A-Za-z0-9_.-]{1,200}\.m?js$/;

function nomDuFichier(adresse: string): string | undefined {
  const chemin = adresse.replace(/[?#].*$/, "");
  const nom = chemin.slice(chemin.lastIndexOf("/") + 1);
  return NOM_DE_FICHIER.test(nom) && !nom.startsWith(".") ? nom : undefined;
}

function cheminDOrigine(source: string): string {
  return source.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*\//, "").replace(/^(?:\.{1,2}\/)+/, "");
}

function nomDeRepli(minifie: string | undefined): string {
  if (minifie === undefined) {
    return "?";
  }
  const point = minifie.lastIndexOf(".");
  return point >= 0 && point < minifie.length - 1 ? minifie.slice(point + 1) : "?";
}

export function creerSymboliseur(lireCarte: LireCarte): (evenement: Objet) => Promise<Objet> {
  // Les cartes lues (ou absentes) restent en mémoire, au plus 50 : la plus ancienne part.
  const cartes = new Map<string, TraceMap | null>();

  async function carte(nom: string): Promise<TraceMap | null> {
    if (cartes.has(nom)) {
      const connue = cartes.get(nom) ?? null;
      cartes.delete(nom);
      cartes.set(nom, connue);
      return connue;
    }
    let lue: TraceMap | null = null;
    try {
      const contenu = await lireCarte(`${nom}.map`);
      if (contenu !== undefined && contenu.length <= TAILLE_CARTE_MAX) {
        lue = new TraceMap(contenu);
      }
    } catch {
      lue = null;
    }
    cartes.set(nom, lue);
    if (cartes.size > CARTES_EN_MEMOIRE) {
      const plusAncienne = cartes.keys().next().value;
      if (plusAncienne !== undefined) {
        cartes.delete(plusAncienne);
      }
    }
    return lue;
  }

  async function symboliserFrames(frames: Objet[]): Promise<void> {
    // Positions d'origine d'abord : le nom d'une frame dépend de la position de la précédente.
    const positions = await Promise.all(
      frames.map(async (frame) => {
        const adresse = texte(frame["filename"]) ?? texte(frame["abs_path"]);
        const nom = adresse === undefined ? undefined : nomDuFichier(adresse);
        const ligne = frame["lineno"];
        const colonne = frame["colno"];
        if (nom === undefined || typeof ligne !== "number" || typeof colonne !== "number") {
          return null;
        }
        const trouvee = await carte(nom);
        if (trouvee === null) {
          return null;
        }
        try {
          const position = originalPositionFor(trouvee, { line: ligne, column: Math.max(colonne - 1, 0) });
          return position.source === null ? null : position;
        } catch {
          return null;
        }
      }),
    );

    frames.forEach((frame, indice) => {
      const position = positions[indice];
      if (position === null || position === undefined) {
        frame["in_app"] = false;
        return;
      }
      const appelante = indice > 0 ? positions[indice - 1] : null;
      const source = cheminDOrigine(position.source ?? "");
      frame["filename"] = source;
      frame["abs_path"] = source;
      frame["lineno"] = position.line;
      frame["colno"] = position.column === null ? null : position.column + 1;
      frame["function"] = appelante?.name ?? nomDeRepli(texte(frame["function"]));
      frame["in_app"] = !source.includes("node_modules/");
      const donnees = frame["data"];
      frame["data"] = { ...(estObjet(donnees) ? donnees : {}), symbolise: true };
    });
  }

  return async (evenement) => {
    if (evenement["platform"] !== "javascript") {
      return evenement;
    }
    const copie = JSON.parse(JSON.stringify(evenement)) as Objet;
    const exception = copie["exception"];
    const valeurs: Json[] = estObjet(exception) && Array.isArray(exception["values"]) ? exception["values"] : [];
    for (const valeur of valeurs) {
      const pile = estObjet(valeur) ? valeur["stacktrace"] : undefined;
      if (estObjet(pile) && Array.isArray(pile["frames"])) {
        await symboliserFrames(pile["frames"].filter(estObjet));
      }
    }
    return copie;
  };
}

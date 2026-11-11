/**
 * Lecture d'une enveloppe Sentry sérialisée (format documenté :
 * https://develop.sentry.dev/sdk/data-model/envelopes/) :
 *
 *   en-tête JSON \n (en-tête d'item JSON \n contenu \n)*
 *
 * Le contenu d'un item fait `length` octets si l'en-tête le précise, sinon il va jusqu'au prochain
 * saut de ligne. Rien n'est supposé valide : toute incohérence rend l'enveloppe illisible (`null`).
 */

import { estObjet, type Json, type Objet } from "./json.ts";

const SAUT_DE_LIGNE = 0x0a;
const ITEMS_MAX = 100;

export interface Item {
  entete: Objet;
  contenu: Uint8Array;
}

export interface Enveloppe {
  entete: Objet;
  items: Item[];
}

const decodeur = new TextDecoder("utf-8", { fatal: true });

function lireJson(octets: Uint8Array): Objet | null {
  try {
    const valeur = JSON.parse(decodeur.decode(octets)) as Json;
    return estObjet(valeur) ? valeur : null;
  } catch {
    return null;
  }
}

function finDeLigne(octets: Uint8Array, debut: number): number {
  const position = octets.indexOf(SAUT_DE_LIGNE, debut);
  return position === -1 ? octets.length : position;
}

export function lireEnveloppe(octets: Uint8Array): Enveloppe | null {
  let position = finDeLigne(octets, 0);
  const entete = lireJson(octets.subarray(0, position));
  if (entete === null) {
    return null;
  }
  position++;

  const items: Item[] = [];
  while (position < octets.length) {
    if (octets[position] === SAUT_DE_LIGNE) {
      position++;
      continue;
    }
    if (items.length >= ITEMS_MAX) {
      return null;
    }
    const finEntete = finDeLigne(octets, position);
    const enteteItem = lireJson(octets.subarray(position, finEntete));
    if (enteteItem === null) {
      return null;
    }
    position = finEntete + 1;

    const longueur = enteteItem["length"];
    let fin: number;
    if (longueur === undefined || longueur === null) {
      fin = finDeLigne(octets, Math.min(position, octets.length));
    } else if (typeof longueur === "number" && Number.isInteger(longueur) && longueur >= 0) {
      fin = position + longueur;
      if (fin > octets.length) {
        return null;
      }
    } else {
      return null;
    }
    items.push({ entete: enteteItem, contenu: octets.subarray(Math.min(position, octets.length), fin) });
    position = fin + 1;
  }
  return { entete, items };
}

/** Le contenu JSON d'un item `event`, ou `null` s'il n'en est pas un. */
export function evenementDeLItem(item: Item): Objet | null {
  return item.entete["type"] === "event" ? lireJson(item.contenu) : null;
}

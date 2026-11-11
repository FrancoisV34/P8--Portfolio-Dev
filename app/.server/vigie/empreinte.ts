/**
 * Empreinte de regroupement (ADR-0007) : même empreinte = même issue.
 *
 * Calculée sur l'événement **déjà nettoyé**. Déterministe, explicable (les éléments retenus sont
 * renvoyés avec l'empreinte) et identique en Python : les cas de `spec/regroupement/` le prouvent.
 */

import { derniereException, messageDe } from "./evenement.ts";
import { estObjet, texte, type Json, type Objet } from "./json.ts";

export const VERSION = "v1";
const FRAMES_RETENUES = 5;
const LONGUEUR_MESSAGE = 200;
const DEFAUT = /^\{\{\s*default\s*\}\}$/i;

export type Regle = "application" | "pile" | "exception" | "message";

export interface Empreinte {
  regle: Regle;
  elements: string[];
  empreinte: string;
}

// --- Normalisation ---------------------------------------------------------------------------

const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const HEXA =
  /(?<![A-Za-z0-9_])(?=[0-9a-fA-F]*[0-9])(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{8,}(?![A-Za-z0-9_])/g;
const CHAINE = /'[^']*'|"[^"]*"|`[^`]*`/g;
const NOMBRE = /(?<![A-Za-z0-9_])[0-9]+(?:\.[0-9]+)?(?![A-Za-z0-9_])/g;

/** Remplace les parties variables d'un message, pour que deux occurrences se ressemblent. */
export function normaliserMessage(message: string): string {
  const normalise = message
    .replace(UUID, "<uuid>")
    .replace(CHAINE, "<str>")
    .replace(HEXA, "<hex>")
    .replace(NOMBRE, "<n>")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalise).slice(0, LONGUEUR_MESSAGE).join("");
}

/**
 * Chemin de fichier stable entre machines et builds : sans schéma ni hôte, sans paramètres,
 * sans empreinte de build dans le nom (`index-B4x9k2Qa.js` → `index.js`), réduit à ses trois
 * derniers segments (le préfixe absolu varie d'une machine à l'autre).
 */
export function normaliserChemin(chemin: string): string {
  const sansSchema = chemin.replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/, "");
  const sansParametres = sansSchema.replace(/[?#].*$/, "");
  const segments = sansParametres.split("/").filter((segment) => segment !== "" && segment !== ".");
  const derniers = segments.slice(-3);
  const dernier = derniers.pop();
  if (dernier === undefined) {
    return "?";
  }
  const sansEmpreinte = dernier.replace(/-(?=[A-Za-z0-9_-]*[0-9])[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9]+)$/, "$1");
  return [...derniers, sansEmpreinte].join("/");
}

// --- Lecture de l'événement ------------------------------------------------------------------

function frames(exception: Objet): Objet[] {
  const pile = exception["stacktrace"];
  const liste = estObjet(pile) ? pile["frames"] : undefined;
  return Array.isArray(liste) ? liste.filter(estObjet) : [];
}

function framesRetenues(exception: Objet): Objet[] {
  const toutes = frames(exception);
  const application = toutes.filter((frame) => frame["in_app"] === true);
  // Sentry range les frames de la plus ancienne à la plus proche de l'erreur.
  return (application.length > 0 ? application : toutes).slice(-FRAMES_RETENUES);
}

function identiteFrame(frame: Objet): string {
  const chemin = texte(frame["filename"]) ?? texte(frame["abs_path"]);
  const module = texte(frame["module"]) ?? (chemin === undefined ? "?" : normaliserChemin(chemin));
  return `${module}:${texte(frame["function"]) ?? "?"}`;
}

/** Une frame du navigateur n'est fiable qu'une fois passée par les source maps (ADR-0009). */
function frameSymbolisee(frame: Objet): boolean {
  const donnees = frame["data"];
  return estObjet(donnees) && donnees["symbolise"] === true;
}

// --- Règles ----------------------------------------------------------------------------------

function elementsParDefaut(evenement: Objet): { regle: Regle; elements: string[] } {
  const exception = derniereException(evenement);
  if (exception !== undefined) {
    const type = texte(exception["type"]) ?? "Error";
    const retenues = framesRetenues(exception);
    const navigateur = evenement["platform"] === "javascript";
    if (retenues.length > 0 && (!navigateur || retenues.every(frameSymbolisee))) {
      return { regle: "pile", elements: ["pile", type, ...retenues.map(identiteFrame)] };
    }
    const valeur = texte(exception["value"]) ?? "";
    return { regle: "exception", elements: ["exception", type, normaliserMessage(valeur)] };
  }
  const niveau = texte(evenement["level"]) ?? "error";
  return { regle: "message", elements: ["message", niveau, normaliserMessage(messageDe(evenement, true) ?? "")] };
}

async function hacher(elements: string[]): Promise<string> {
  const octets = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(elements.join("\n")));
  const hexa = Array.from(new Uint8Array(octets), (octet) => octet.toString(16).padStart(2, "0"));
  return `${VERSION}:${hexa.join("")}`;
}

function valeurEnTexte(valeur: Json): string {
  return typeof valeur === "string" ? valeur : JSON.stringify(valeur);
}

export async function calculerEmpreinte(evenement: Objet): Promise<Empreinte> {
  const parDefaut = elementsParDefaut(evenement);
  const fournie = evenement["fingerprint"];
  if (Array.isArray(fournie) && fournie.length > 0) {
    const empreinteParDefaut = await hacher(parDefaut.elements);
    const elements = [
      "application",
      ...fournie.map((valeur) =>
        typeof valeur === "string" && DEFAUT.test(valeur.trim()) ? empreinteParDefaut : valeurEnTexte(valeur),
      ),
    ];
    return { regle: "application", elements, empreinte: await hacher(elements) };
  }
  return { ...parDefaut, empreinte: await hacher(parDefaut.elements) };
}

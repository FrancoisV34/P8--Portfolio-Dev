/**
 * Nettoyage d'un événement Sentry avant toute écriture (ADR-0005).
 *
 * Ne fait pas confiance au SDK : tout l'événement est parcouru, quel que soit le champ.
 * Règles (les cas de `spec/nettoyage/` en sont la référence, rejoués par `py/` et `ts/`) :
 * - champ au nom sensible (mot de passe, jeton, cookie…) → valeur masquée ;
 * - corps de requête, cookies et variables locales des frames → supprimés ;
 * - utilisateur → seuls l'identifiant et l'adresse IP tronquée sont gardés ;
 * - dans tout texte : e-mails, cartes, IBAN, jetons JWT / Bearer / Basic, identifiants dans une
 *   URL et paramètres d'URL sensibles → masqués.
 * Les motifs n'utilisent que de l'ASCII et des assertions de longueur fixe : ils se comportent à
 * l'identique en Python.
 */

import { estObjet, type Json, type Objet } from "./json.ts";

export const MASQUE = "[masqué]";
/** Au-delà, une valeur est remplacée : un JSON très imbriqué ne doit pas faire tomber l'application. */
export const PROFONDEUR_MAX = 32;
export const TROP_PROFOND = "[trop profond]";

/** Un de ces mots, seul dans le nom d'un champ, rend le champ sensible. Anglais et français : les
 * applications nomment leurs champs dans les deux langues. */
const MOTS_SENSIBLES = new Set([
  "auth",
  "authorization",
  "bearer",
  "cookie",
  "cookies",
  "credential",
  "credentials",
  "csrf",
  "cvc",
  "cvv",
  "dsn",
  "iban",
  "jeton",
  "jetons",
  "jwt",
  "mdp",
  "otp",
  "passphrase",
  "passwd",
  "password",
  "pin",
  "pwd",
  "rib",
  "secret",
  "signature",
  "token",
  "xsrf",
]);

/** Ces noms, une fois leurs mots recollés (`api_key` → `apikey`), rendent le champ sensible. */
const NOMS_SENSIBLES = new Set([
  "accesskey",
  "accesstoken",
  "apikey",
  "cardnumber",
  "cleapi",
  "clefapi",
  "clesecrete",
  "ccnumber",
  "clientsecret",
  "creditcard",
  "motdepasse",
  "numerocarte",
  "privatekey",
  "refreshtoken",
  "secretkey",
  "sessionid",
  "sessionkey",
  "setcookie",
]);

/** Champs qui portent une adresse IP : gardée, mais tronquée. */
const NOMS_IP = new Set(["clientip", "ip", "ipaddress", "remoteaddr", "xforwardedfor", "xrealip"]);

/** `XApiKey`, `x-api-key`, `X_API_KEY` → `["x", "api", "key"]`. */
export function motsDuNom(nom: string): string[] {
  return nom
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((mot) => mot !== "");
}

function assemblages(mots: string[]): string[] {
  const resultat: string[] = [];
  for (let debut = 0; debut < mots.length; debut++) {
    for (let fin = debut + 2; fin <= Math.min(mots.length, debut + 3); fin++) {
      resultat.push(mots.slice(debut, fin).join(""));
    }
  }
  resultat.push(mots.join(""));
  return resultat;
}

export function nomSensible(nom: string): boolean {
  const mots = motsDuNom(nom);
  return (
    mots.some((mot) => MOTS_SENSIBLES.has(mot)) ||
    assemblages(mots).some((assemblage) => NOMS_SENSIBLES.has(assemblage))
  );
}

function nomIp(nom: string): boolean {
  return NOMS_IP.has(motsDuNom(nom).join(""));
}

// --- Adresses IP -----------------------------------------------------------------------------

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** IPv4 → /24 (`203.0.113.42` → `203.0.113.0`) ; IPv6 → /48. Toute autre valeur est masquée. */
export function tronquerIp(valeur: string): string {
  const v4 = IPV4.exec(valeur.trim());
  if (v4 !== null) {
    const octets = v4.slice(1, 5).map(Number);
    if (octets.every((octet) => octet <= 255)) {
      return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
    }
    return MASQUE;
  }
  const groupes = developperIpv6(valeur.trim());
  if (groupes === null) {
    return MASQUE;
  }
  return `${groupes.slice(0, 3).join(":")}::`;
}

function developperIpv6(valeur: string): string[] | null {
  if (!/^[0-9a-fA-F:]+$/.test(valeur) || valeur.split("::").length > 2) {
    return null;
  }
  const [tete = "", queue] = valeur.split("::");
  const avant = tete === "" ? [] : tete.split(":");
  const apres = queue === undefined || queue === "" ? [] : queue.split(":");
  const manquants = 8 - avant.length - apres.length;
  if ((queue === undefined && manquants !== 0) || (queue !== undefined && manquants < 1)) {
    return null;
  }
  const groupes = [...avant, ...Array<string>(Math.max(manquants, 0)).fill("0"), ...apres];
  if (groupes.some((groupe) => !/^[0-9a-fA-F]{1,4}$/.test(groupe))) {
    return null;
  }
  return groupes.map((groupe) => groupe.toLowerCase().replace(/^0+(?=.)/, ""));
}

function tronquerIps(valeur: Json): Json {
  if (typeof valeur !== "string") {
    return valeur === null ? null : MASQUE;
  }
  // `X-Forwarded-For` peut porter une liste.
  return valeur
    .split(",")
    .map((morceau) => tronquerIp(morceau))
    .join(", ");
}

// --- Motifs dans les textes ------------------------------------------------------------------

// Tous les motifs ont des répétitions bornées : un texte piégé ne peut pas les faire tourner
// longtemps (ReDoS) ; le contenu d'une erreur vient de l'extérieur.
const URL_AVEC_IDENTIFIANTS = /([A-Za-z][A-Za-z0-9+.-]{0,31}:\/\/)[^\s/@:]{1,256}:[^\s/@]{1,256}@/g;
// JWT : on découpe d'abord le texte en mots (passage linéaire), puis on teste chaque mot avec un
// motif ancré, sans retour arrière possible ; chercher le motif directement dans un texte piégé
// (« eyJeyJeyJ… ») coûterait un temps quadratique.
const MOT_JETON = /[A-Za-z0-9_.-]+/g;
const JWT = /^eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*$/;
const BEARER_BASIC = /(Bearer|Basic)\s{1,8}(?=[A-Za-z0-9_.~+/-]{0,4096}[0-9])[A-Za-z0-9_.~+/-]{8,4096}={0,2}/gi;
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/g;
// Aussi en début de texte : le SDK envoie `query_string` sans le `?`.
const PARAMETRE_URL = /(^|[?&;])([^=&#\s;?]{1,256})=([^&#\s;]*)/g;
// Cartes : 13 à 19 chiffres, espaces ou tirets permis, premier chiffre 2 à 6 (les horodatages
// en millisecondes commencent par 1 et ne sont pas des cartes), validés par Luhn.
const CARTE = /(?<![0-9])[2-6](?:[ -]?[0-9]){12,18}(?![0-9])/g;
const IBAN = /(?<![A-Za-z0-9])[A-Z]{2}[0-9]{2}(?: ?[A-Z0-9]){11,30}(?![A-Za-z0-9])/g;

function luhn(chiffres: string): boolean {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    let chiffre = Number(chiffres[chiffres.length - 1 - i]);
    if (i % 2 === 1) {
      chiffre *= 2;
      if (chiffre > 9) {
        chiffre -= 9;
      }
    }
    somme += chiffre;
  }
  return somme % 10 === 0;
}

function ibanValide(iban: string): boolean {
  const compact = iban.replace(/ /g, "");
  if (compact.length < 15 || compact.length > 34) {
    return false;
  }
  const reordonne = compact.slice(4) + compact.slice(0, 4);
  let reste = 0;
  for (const caractere of reordonne) {
    const valeur = /[0-9]/.test(caractere) ? caractere : String(caractere.charCodeAt(0) - 55);
    for (const chiffre of valeur) {
      reste = (reste * 10 + Number(chiffre)) % 97;
    }
  }
  return reste === 1;
}

export function nettoyerTexte(texte: string): string {
  return texte
    .replace(URL_AVEC_IDENTIFIANTS, `$1${MASQUE}@`)
    .replace(MOT_JETON, (mot) => (JWT.test(mot) ? MASQUE : mot))
    .replace(BEARER_BASIC, `$1 ${MASQUE}`)
    .replace(EMAIL, "[email]")
    .replace(PARAMETRE_URL, (tout, separateur: string, nom: string) =>
      nomSensible(nom) ? `${separateur}${nom}=${MASQUE}` : tout,
    )
    .replace(IBAN, (tout) => (ibanValide(tout) ? "[iban]" : tout))
    .replace(CARTE, (tout) => (luhn(tout.replace(/[ -]/g, "")) ? "[carte]" : tout));
}

// --- Parcours de l'événement -----------------------------------------------------------------

function nettoyerValeur(valeur: Json, profondeur = 0): Json {
  if (profondeur > PROFONDEUR_MAX && (Array.isArray(valeur) || estObjet(valeur))) {
    return TROP_PROFOND;
  }
  if (typeof valeur === "string") {
    return nettoyerTexte(valeur);
  }
  if (Array.isArray(valeur)) {
    // Le protocole Sentry permet aussi les en-têtes et paramètres en paires `[nom, valeur]`.
    const [nom, contenu] = valeur;
    if (valeur.length === 2 && typeof nom === "string" && contenu !== undefined) {
      if (nomSensible(nom)) {
        return [nettoyerTexte(nom), contenu === null ? null : MASQUE];
      }
      if (nomIp(nom)) {
        return [nettoyerTexte(nom), tronquerIps(contenu)];
      }
    }
    return valeur.map((element) => nettoyerValeur(element, profondeur + 1));
  }
  if (estObjet(valeur)) {
    const resultat: Objet = {};
    for (const [cle, contenu] of Object.entries(valeur)) {
      const cleNettoyee = nettoyerTexte(cle);
      if (nomSensible(cle)) {
        resultat[cleNettoyee] = contenu === null ? null : MASQUE;
      } else if (nomIp(cle)) {
        resultat[cleNettoyee] = tronquerIps(contenu);
      } else {
        resultat[cleNettoyee] = nettoyerValeur(contenu, profondeur + 1);
      }
    }
    return resultat;
  }
  return valeur;
}

function retirerVariablesDesFrames(valeur: Json, profondeur: number): void {
  if (profondeur > PROFONDEUR_MAX) {
    return;
  }
  if (Array.isArray(valeur)) {
    valeur.forEach((element) => retirerVariablesDesFrames(element, profondeur + 1));
  } else if (estObjet(valeur)) {
    if (Array.isArray(valeur["frames"])) {
      for (const frame of valeur["frames"]) {
        if (estObjet(frame)) {
          delete frame["vars"];
        }
      }
    }
    Object.values(valeur).forEach((element) => retirerVariablesDesFrames(element, profondeur + 1));
  }
}

/** Renvoie une copie nettoyée de l'événement ; l'original n'est pas modifié. */
export function nettoyer(evenement: Objet): Objet {
  const copie = nettoyerValeur(evenement) as Objet;

  const requete = copie["request"];
  if (estObjet(requete)) {
    delete requete["data"];
    delete requete["cookies"];
  }

  const utilisateur = copie["user"];
  if (estObjet(utilisateur)) {
    const garde: Objet = {};
    if (utilisateur["id"] !== undefined) {
      garde["id"] = utilisateur["id"];
    }
    if (utilisateur["ip_address"] !== undefined) {
      garde["ip_address"] = utilisateur["ip_address"];
    }
    copie["user"] = garde;
  }

  retirerVariablesDesFrames(copie, 0);
  return copie;
}

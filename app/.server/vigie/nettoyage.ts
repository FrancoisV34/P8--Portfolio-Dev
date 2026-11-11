/**
 * Nettoyage d'un événement Sentry avant toute écriture (ADR-0005).
 *
 * Ne fait pas confiance au SDK. Règles (les cas de `spec/nettoyage/` en sont la référence, rejoués
 * par `py/` et `ts/`) :
 * - liste autorisée (ADR-0011) : seuls les champs utiles au diagnostic sont gardés, tout le reste
 *   est jeté (corps et en-têtes de requête, cookies, variables locales et lignes de source des
 *   frames, fil d'Ariane, `extra`…) ; textes coupés, piles et listes bornées, squelette au-delà de
 *   `evenementOctetsMax` ;
 * - tag au nom sensible (mot de passe, jeton, cookie…) → valeur masquée ;
 * - utilisateur → seuls l'identifiant et l'adresse IP tronquée sont gardés ;
 * - dans tout texte gardé : e-mails, cartes, IBAN, jetons JWT / Bearer / Basic, identifiants dans
 *   une URL et paramètres d'URL sensibles → masqués.
 * Les motifs n'utilisent que de l'ASCII et des assertions de longueur fixe : ils se comportent à
 * l'identique en Python.
 */

import { estObjet, type Json, type Objet } from "./json.ts";

export const MASQUE = "[masqué]";

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
// Le schéma et la partie locale d'un e-mail ne commencent qu'en début de suite de caractères
// permis (lookbehind) et s'étendent sans borne : un seul passage par suite, donc un temps linéaire
// (borner à 64 caractères faisait tout réessayer à chaque position d'une longue suite de lettres),
// et une suite plus longue est masquée entière.
const URL_AVEC_IDENTIFIANTS = /(?<![A-Za-z0-9+.-])([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/@:]{1,256}:[^\s/@]{1,256}@/g;
// JWT : on découpe d'abord le texte en mots (passage linéaire), puis on teste chaque mot avec un
// motif ancré, sans retour arrière possible ; chercher le motif directement dans un texte piégé
// (« eyJeyJeyJ… ») coûterait un temps quadratique.
const MOT_JETON = /[A-Za-z0-9_.-]+/g;
const JWT = /^eyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*$/;
const BEARER_BASIC = /(Bearer|Basic)\s{1,8}(?=[A-Za-z0-9_.~+/-]{0,4096}[0-9])[A-Za-z0-9_.~+/-]{8,4096}={0,2}/gi;
const EMAIL = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}/g;
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

// --- Liste autorisée et réduction (ADR-0011) ------------------------------------------------

export const MARQUE_COUPE = "…[coupé]";
/** Taille maximale par défaut d'un événement stocké, en octets UTF-8 de son JSON compact. */
export const EVENEMENT_OCTETS_MAX = 32_000;
const TEXTE_MAX = 2000;
/** Un texte est tronqué à `max + MARGE_MASQUAGE` avant le masquage, puis coupé à `max` : un motif
 * masquable fait au plus quelques milliers de caractères, donc un secret coupé par la première
 * troncature tombe toujours dans la partie jetée par la seconde. */
const MARGE_MASQUAGE = 8192;
const EXCEPTIONS_MAX = 10;
const FRAMES_MAX = 50;
const FRAMES_SQUELETTE = 10;
const TAGS_MAX = 20;
const CLE_TAG_MAX = 32;
const EMPREINTE_MAX = 10;
const ENTIER_MAX = 1_000_000_000;
const CONTEXTES = ["browser", "os", "runtime", "device"];

interface Etat {
  reduit: boolean;
}

/** Les `n` premiers points de code d'un texte, et s'il a fallu couper. */
function prefixe(texte: string, n: number): [string, boolean] {
  if (texte.length <= n) {
    return [texte, false];
  }
  let position = 0;
  let compte = 0;
  for (const caractere of texte) {
    if (compte === n) {
      return [texte.slice(0, position), true];
    }
    position += caractere.length;
    compte++;
  }
  return [texte, false];
}

// Surrogate isolé (UTF-16 invalide) → U+FFFD, comme `String.prototype.toWellFormed` (absent des
// types de certains hôtes) : mêmes tailles en TypeScript et en Python.
const SURROGATE_ISOLE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

function bienForme(texte: string): string {
  return texte.replace(SURROGATE_ISOLE, "\uFFFD");
}

/** Un texte gardé : masqué, puis coupé à `max` points de code et marqué s'il était plus long. */
function texteGarde(valeur: Json | undefined, max: number, etat: Etat): string | undefined {
  if (typeof valeur !== "string") {
    return undefined;
  }
  const [brut, tronque] = prefixe(valeur, max + MARGE_MASQUAGE);
  const [court, coupe] = prefixe(nettoyerTexte(bienForme(brut)), max);
  if (tronque || coupe) {
    etat.reduit = true;
    return court + MARQUE_COUPE;
  }
  return court;
}

/** Recoupe un texte déjà nettoyé (squelette). */
function recouper(valeur: Json | undefined, max: number): string | undefined {
  if (typeof valeur !== "string") {
    return undefined;
  }
  const [court, coupe] = prefixe(valeur, max);
  return coupe ? court + MARQUE_COUPE : court;
}

/** Un entier de 0 à 10⁹ (numéro de ligne, de colonne), sinon rien. */
function entierBorne(valeur: Json | undefined): number | undefined {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 0 && valeur <= ENTIER_MAX ? valeur : undefined;
}

function booleen(valeur: Json | undefined): boolean | undefined {
  return typeof valeur === "boolean" ? valeur : undefined;
}

/** Pose une valeur sans passer par un éventuel accesseur (`__proto__` est une clé comme une autre). */
function poser(cible: Objet, cle: string, valeur: Json | undefined): void {
  if (valeur !== undefined) {
    Object.defineProperty(cible, cle, { value: valeur, enumerable: true, writable: true, configurable: true });
  }
}

function textes(source: Objet, cles: string[], max: number, etat: Etat): Objet {
  const resultat: Objet = {};
  for (const cle of cles) {
    poser(resultat, cle, texteGarde(source[cle], max, etat));
  }
  return resultat;
}

function frameGardee(frame: Objet, etat: Etat): Objet {
  const resultat = textes(frame, ["filename", "abs_path", "module", "function"], TEXTE_MAX, etat);
  poser(resultat, "lineno", entierBorne(frame["lineno"]));
  poser(resultat, "colno", entierBorne(frame["colno"]));
  poser(resultat, "in_app", booleen(frame["in_app"]));
  return resultat;
}

/** 50 frames au plus : la première, plus les 49 plus proches de l'erreur (Sentry range les frames de
 * la plus ancienne à la plus proche). */
function pileGardee(pile: Objet, etat: Etat): Objet {
  const liste = pile["frames"];
  if (!Array.isArray(liste)) {
    return {};
  }
  let frames = liste.filter(estObjet);
  if (frames.length > FRAMES_MAX) {
    frames = [frames[0]!, ...frames.slice(-(FRAMES_MAX - 1))];
    etat.reduit = true;
  }
  return { frames: frames.map((frame) => frameGardee(frame, etat)) };
}

function exceptionGardee(exception: Objet, etat: Etat): Objet {
  const resultat: Objet = {};
  poser(resultat, "type", texteGarde(exception["type"], 200, etat));
  poser(resultat, "value", texteGarde(exception["value"], TEXTE_MAX, etat));
  poser(resultat, "module", texteGarde(exception["module"], 200, etat));
  const mecanisme = exception["mechanism"];
  if (estObjet(mecanisme)) {
    const garde: Objet = {};
    poser(garde, "type", texteGarde(mecanisme["type"], 200, etat));
    poser(garde, "handled", booleen(mecanisme["handled"]));
    poser(garde, "synthetic", booleen(mecanisme["synthetic"]));
    resultat["mechanism"] = garde;
  }
  const pile = exception["stacktrace"];
  if (estObjet(pile)) {
    resultat["stacktrace"] = pileGardee(pile, etat);
  }
  return resultat;
}

function exceptionsGardees(valeur: Json | undefined, etat: Etat): Objet | undefined {
  // Le protocole permet aussi la liste seule, sans `values`.
  const liste = estObjet(valeur) ? valeur["values"] : valeur;
  if (!Array.isArray(liste)) {
    return undefined;
  }
  let exceptions = liste.filter(estObjet);
  if (exceptions.length > EXCEPTIONS_MAX) {
    exceptions = exceptions.slice(-EXCEPTIONS_MAX);
    etat.reduit = true;
  }
  return { values: exceptions.map((exception) => exceptionGardee(exception, etat)) };
}

function messageGarde(valeur: Json | undefined, etat: Etat): Json | undefined {
  if (typeof valeur === "string") {
    return texteGarde(valeur, TEXTE_MAX, etat);
  }
  return estObjet(valeur) ? textes(valeur, ["message", "formatted"], TEXTE_MAX, etat) : undefined;
}

function requeteGardee(valeur: Json | undefined, etat: Etat): Objet | undefined {
  if (!estObjet(valeur)) {
    return undefined;
  }
  const resultat: Objet = {};
  const url = valeur["url"];
  // Ni paramètres ni fragment : ils portent souvent un jeton ou une donnée de l'utilisateur.
  poser(resultat, "url", typeof url === "string" ? texteGarde(url.split(/[?#]/)[0], TEXTE_MAX, etat) : undefined);
  poser(resultat, "method", texteGarde(valeur["method"], 16, etat));
  return resultat;
}

function ipGardee(valeur: Json | undefined): Json | undefined {
  if (valeur === undefined || valeur === null) {
    return undefined;
  }
  return tronquerIps(valeur);
}

function utilisateurGarde(valeur: Json | undefined, etat: Etat): Objet | undefined {
  if (!estObjet(valeur)) {
    return undefined;
  }
  const resultat: Objet = {};
  const id = valeur["id"];
  poser(resultat, "id", typeof id === "number" ? (Number.isSafeInteger(id) ? id : undefined) : texteGarde(id, 200, etat));
  poser(resultat, "ip_address", ipGardee(valeur["ip_address"]));
  return resultat;
}

function tagsGardes(valeur: Json | undefined, etat: Etat): Objet | undefined {
  let entrees: [Json, Json][];
  if (Array.isArray(valeur)) {
    entrees = valeur.filter((paire) => Array.isArray(paire) && paire.length === 2).map((paire) => {
      const [nom, contenu] = paire as [Json, Json];
      return [nom, contenu];
    });
  } else if (estObjet(valeur)) {
    entrees = Object.entries(valeur);
  } else {
    return undefined;
  }
  const resultat: Objet = {};
  let gardes = 0;
  for (const [cle, contenu] of entrees) {
    if (gardes === TAGS_MAX) {
      etat.reduit = true;
      break;
    }
    if (typeof cle !== "string") {
      continue;
    }
    if (prefixe(cle, CLE_TAG_MAX)[1]) {
      etat.reduit = true;
      continue;
    }
    const nom = nettoyerTexte(bienForme(cle));
    if (Object.hasOwn(resultat, nom)) {
      continue;
    }
    if (typeof contenu !== "string" && typeof contenu !== "number" && typeof contenu !== "boolean") {
      continue;
    }
    let garde: Json | undefined;
    if (nomSensible(cle)) {
      garde = MASQUE;
    } else if (nomIp(cle)) {
      garde = tronquerIps(contenu);
    } else {
      garde = typeof contenu === "string" ? texteGarde(contenu, 200, etat) : contenu;
    }
    poser(resultat, nom, garde);
    gardes++;
  }
  return resultat;
}

function contextesGardes(valeur: Json | undefined, etat: Etat): Objet | undefined {
  if (!estObjet(valeur)) {
    return undefined;
  }
  const resultat: Objet = {};
  for (const nom of CONTEXTES) {
    const contexte = valeur[nom];
    if (estObjet(contexte)) {
      resultat[nom] = textes(contexte, ["name", "version", "family"], 200, etat);
    }
  }
  return resultat;
}

function empreinteFournie(valeur: Json | undefined, etat: Etat): Json[] | undefined {
  if (!Array.isArray(valeur)) {
    return undefined;
  }
  let elements = valeur.filter((element) => ["string", "number", "boolean"].includes(typeof element));
  if (elements.length > EMPREINTE_MAX) {
    elements = elements.slice(0, EMPREINTE_MAX);
    etat.reduit = true;
  }
  return elements.map((element) => (typeof element === "string" ? (texteGarde(element, 200, etat) ?? "") : element));
}

function horodatage(valeur: Json | undefined, etat: Etat): Json | undefined {
  return typeof valeur === "number" ? valeur : texteGarde(valeur, 64, etat);
}

/** Octets UTF-8 du JSON compact : la mesure du budget (ADR-0011). */
export function octetsJson(valeur: Json): number {
  return new TextEncoder().encode(JSON.stringify(valeur)).length;
}

/** Taille de l'événement reçu, pour information ; inconnue (`null`) s'il est trop imbriqué pour être
 * resérialisé : il ne doit pas faire échouer son propre stockage. */
function tailleOrigine(evenement: Objet): number | null {
  try {
    return octetsJson(evenement);
  } catch {
    return null;
  }
}

function marqueValide(valeur: Json | undefined): valeur is Objet {
  if (!estObjet(valeur) || valeur["reduit"] !== true) {
    return false;
  }
  const taille = valeur["taille_origine"];
  return taille === null || (typeof taille === "number" && Number.isSafeInteger(taille) && taille >= 0);
}

function frameCourte(frame: Json): Objet {
  if (!estObjet(frame)) {
    return {};
  }
  const resultat: Objet = {};
  for (const cle of ["filename", "abs_path", "module", "function"]) {
    poser(resultat, cle, recouper(frame[cle], 100));
  }
  for (const cle of ["lineno", "colno", "in_app"]) {
    poser(resultat, cle, frame[cle]);
  }
  const donnees = frame["data"];
  if (estObjet(donnees) && donnees["symbolise"] === true) {
    resultat["data"] = { symbolise: true };
  }
  return resultat;
}

/** Ce qui reste d'un événement trop gros : de quoi le regrouper et le reconnaître. */
function squelette(evenement: Objet, minimal: boolean): Objet {
  const resultat: Objet = {};
  for (const cle of ["event_id", "timestamp", "level", "platform", "release", "environment", "transaction"]) {
    poser(resultat, cle, evenement[cle]);
  }
  if (!minimal) {
    poser(resultat, "fingerprint", evenement["fingerprint"]);
  }
  const longueur = minimal ? 200 : 1000;
  const exception = evenement["exception"];
  const valeurs = estObjet(exception) ? exception["values"] : undefined;
  const levee = Array.isArray(valeurs) ? valeurs.at(-1) : undefined;
  if (estObjet(levee)) {
    const garde: Objet = {};
    poser(garde, "type", levee["type"]);
    poser(garde, "module", levee["module"]);
    poser(garde, "value", recouper(levee["value"], longueur));
    poser(garde, "mechanism", levee["mechanism"]);
    const pile = levee["stacktrace"];
    if (!minimal && estObjet(pile) && Array.isArray(pile["frames"])) {
      garde["stacktrace"] = { frames: pile["frames"].slice(-FRAMES_SQUELETTE).map(frameCourte) };
    }
    resultat["exception"] = { values: [garde] };
  }
  for (const cle of ["message", "logentry"]) {
    const message = evenement[cle];
    if (typeof message === "string") {
      resultat[cle] = recouper(message, longueur) ?? "";
    } else if (estObjet(message)) {
      const garde: Objet = {};
      poser(garde, "message", recouper(message["message"], longueur));
      poser(garde, "formatted", recouper(message["formatted"], longueur));
      resultat[cle] = garde;
    }
  }
  return resultat;
}

/**
 * Plafond de taille (E1) : un événement dont le JSON dépasse `octetsMax` est remplacé par son
 * squelette, puis par un squelette minimal si besoin. Sert après le nettoyage, et de nouveau après
 * la symbolisation (qui peut allonger les frames).
 */
export function borner(evenement: Objet, octetsMax = EVENEMENT_OCTETS_MAX, original: Objet = evenement): Objet {
  if (octetsJson(evenement) <= octetsMax) {
    return evenement;
  }
  const marque = evenement["_vigie"];
  const origine = marqueValide(marque) ? marque["taille_origine"]! : tailleOrigine(original);
  for (const minimal of [false, true]) {
    const reduit = { ...squelette(evenement, minimal), _vigie: { reduit: true, taille_origine: origine } };
    if (minimal || octetsJson(reduit) <= octetsMax) {
      return reduit;
    }
  }
  return evenement;
}

/**
 * Nettoyage d'un événement (ADR-0005, ADR-0011) : construit une copie qui ne garde que les champs
 * utiles au diagnostic, masque chaque texte gardé et borne sa taille. L'original n'est pas modifié.
 */
export function nettoyer(evenement: Objet, octetsMax = EVENEMENT_OCTETS_MAX): Objet {
  const etat: Etat = { reduit: false };
  const resultat: Objet = {};
  poser(resultat, "event_id", texteGarde(evenement["event_id"], 64, etat));
  poser(resultat, "timestamp", horodatage(evenement["timestamp"], etat));
  poser(resultat, "level", texteGarde(evenement["level"], 32, etat));
  poser(resultat, "platform", texteGarde(evenement["platform"], 32, etat));
  for (const cle of ["release", "environment", "transaction"]) {
    poser(resultat, cle, texteGarde(evenement[cle], 200, etat));
  }
  poser(resultat, "fingerprint", empreinteFournie(evenement["fingerprint"], etat));
  poser(resultat, "message", messageGarde(evenement["message"], etat));
  poser(resultat, "logentry", messageGarde(evenement["logentry"], etat));
  poser(resultat, "exception", exceptionsGardees(evenement["exception"], etat));
  poser(resultat, "request", requeteGardee(evenement["request"], etat));
  poser(resultat, "user", utilisateurGarde(evenement["user"], etat));
  poser(resultat, "tags", tagsGardes(evenement["tags"], etat));
  poser(resultat, "contexts", contextesGardes(evenement["contexts"], etat));
  poser(resultat, "sdk", estObjet(evenement["sdk"]) ? textes(evenement["sdk"], ["name", "version"], 200, etat) : undefined);

  // Une marque déjà présente (second passage, après la symbolisation) garde la taille d'origine.
  const marque = evenement["_vigie"];
  if (marqueValide(marque)) {
    resultat["_vigie"] = { reduit: true, taille_origine: marque["taille_origine"]! };
  } else if (etat.reduit) {
    resultat["_vigie"] = { reduit: true, taille_origine: tailleOrigine(evenement) };
  }
  return borner(resultat, octetsMax, evenement);
}

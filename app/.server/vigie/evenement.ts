/** Lecture d'un événement Sentry, commune à l'empreinte et au stockage. */

import { estObjet, texte, type Objet } from "./json.ts";

/**
 * L'exception levée : la dernière de la chaîne (Sentry les range de la plus ancienne à celle qui a
 * été levée). Une exception **synthétique** n'en est pas une : le SDK JS 11 en fabrique une pour
 * porter la pile d'un simple `captureMessage` ; l'événement est alors traité comme un message.
 */
export function derniereException(evenement: Objet): Objet | undefined {
  const exception = evenement["exception"];
  const valeurs = estObjet(exception) ? exception["values"] : exception;
  if (!Array.isArray(valeurs)) {
    return undefined;
  }
  const derniere = valeurs[valeurs.length - 1];
  if (!estObjet(derniere)) {
    return undefined;
  }
  const mecanisme = derniere["mechanism"];
  return estObjet(mecanisme) && mecanisme["synthetic"] === true ? undefined : derniere;
}

/**
 * Le message d'un événement sans exception. `gabarit` : préférer le gabarit (« %s introuvable »),
 * qui regroupe mieux, au texte formaté, plus lisible.
 */
export function messageDe(evenement: Objet, gabarit: boolean): string | undefined {
  const sources = [evenement["logentry"], evenement["message"]];
  for (const source of sources) {
    if (typeof source === "string") {
      return source;
    }
    if (estObjet(source)) {
      const ordre = gabarit ? [source["message"], source["formatted"]] : [source["formatted"], source["message"]];
      const trouve = ordre.map(texte).find((valeur) => valeur !== undefined);
      if (trouve !== undefined) {
        return trouve;
      }
    }
  }
  // Exception synthétique d'un `captureMessage` sans champ `message` : sa valeur porte le texte.
  const exception = evenement["exception"];
  const valeurs = estObjet(exception) ? exception["values"] : undefined;
  const derniere = Array.isArray(valeurs) ? valeurs[valeurs.length - 1] : undefined;
  return estObjet(derniere) ? texte(derniere["value"]) : undefined;
}

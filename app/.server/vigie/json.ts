/** Un événement Sentry tel qu'il arrive : du JSON, dont on ne suppose rien. */
export type Json = null | boolean | number | string | Json[] | { [cle: string]: Json };
export type Objet = { [cle: string]: Json };

export function estObjet(valeur: Json | undefined): valeur is Objet {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

export function texte(valeur: Json | undefined): string | undefined {
  return typeof valeur === "string" ? valeur : undefined;
}

// Forme d'une adresse de connexion privée : un seul segment, sans caractère
// spécial. Partagée entre le serveur et l'entrée discrète du pied de page ;
// elle ne dit rien de l'adresse réellement configurée.
export const privatePathShape = /^\/[A-Za-z0-9][A-Za-z0-9._~-]{1,63}$/;

/** Transforme le code tapé en chemin, ou `null` s'il ne peut pas en être un. */
export function hiddenEntryPath(code: string) {
  const path = `/${code.trim().replace(/^\/+/, '')}`;
  return privatePathShape.test(path) ? path : null;
}

import { createHash, timingSafeEqual } from 'node:crypto';

// L'adresse de connexion n'est pas un secret cryptographique : elle réduit le
// bruit des robots et empêche qu'une URL publique désigne l'espace privé. Le
// mot de passe et la vérification du propriétaire restent la vraie protection.
const shape = /^\/[A-Za-z0-9][A-Za-z0-9._~-]{1,63}$/;

export function privateLoginPath(value = process.env.PRIVATE_LOGIN_PATH) {
  const path = value?.trim() || '/co';
  if (!shape.test(path)) {
    throw new Error('PRIVATE_LOGIN_PATH doit être un segment unique comme /b3f1a9c2, sans sous-dossier ni caractère spécial.');
  }
  return path;
}

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

/**
 * React Router demande les données d'une page avec le suffixe `.data` : les
 * deux formes de l'adresse doivent être reconnues, et la comparaison se fait
 * en temps constant pour ne pas révéler le chemin caractère par caractère.
 */
export function isPrivateLoginPath(pathname: string, expected = privateLoginPath()) {
  const candidate = pathname.replace(/\.data$/, '').replace(/\/$/, '') || '/';
  return timingSafeEqual(digest(candidate), digest(expected));
}

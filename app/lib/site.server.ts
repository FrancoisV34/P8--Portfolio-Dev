// Ne jamais construire les URLs publiques à partir du Host envoyé par un visiteur.
export function siteOrigin(value = process.env.SITE_URL ?? 'http://localhost:5173') {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SITE_URL doit être une origine HTTP(S), sans identifiants ni sous-dossier.');
  }
  return url.origin;
}

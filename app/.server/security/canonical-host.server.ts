import { siteOrigin } from '../../lib/site.server.ts';

/**
 * Une seule adresse publique : toute requête reçue sous un autre nom (l'ancienne
 * adresse fly.dev, `www.`, un nom inconnu) est renvoyée vers `SITE_URL`.
 *
 * La destination est construite uniquement depuis `SITE_URL` : le Host et la
 * cible de la requête ne fournissent jamais l'hôte, seulement le chemin et la
 * requête. `/healthz` n'est jamais redirigé, car les contrôles de santé de Fly
 * n'utilisent pas le nom public.
 */
export function canonicalRedirect(host: string | undefined, target: string, origin = siteOrigin()) {
  const canonical = new URL(origin);
  if (host?.toLowerCase() === canonical.host) return null;

  let path: URL;
  try {
    path = new URL(target, 'http://requete.invalid');
  } catch {
    return `${canonical.origin}/`;
  }
  if (path.pathname === '/healthz') return null;

  // Affecter le chemin à l'URL canonique garde l'hôte, même pour `//autre.site`.
  canonical.pathname = path.pathname;
  canonical.search = path.search;
  return canonical.href;
}

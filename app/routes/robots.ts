import { siteOrigin } from '../lib/site.server';

// Aucune adresse privée n'est listée ici : un `Disallow` publierait ce qu'il
// prétend protéger. Les réponses privées portent déjà `X-Robots-Tag: noindex`
// et répondent « introuvable » sans session.
export function loader() {
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin()}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

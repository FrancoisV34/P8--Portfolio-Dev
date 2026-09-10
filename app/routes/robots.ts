import { siteOrigin } from '../lib/site.server';

export function loader() {
  return new Response(`User-agent: *\nAllow: /\nDisallow: /finance\nDisallow: /api/\n\nSitemap: ${siteOrigin()}/sitemap.xml\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

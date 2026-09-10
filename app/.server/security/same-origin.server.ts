import { siteOrigin } from '../../lib/site.server.ts';

/** Les mutations financières n’acceptent que les formulaires de l’origine configurée. */
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== siteOrigin()) {
    throw new Response('Requête refusée.', {
      status: 403,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }
}

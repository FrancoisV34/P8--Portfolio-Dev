import { recevoirEnveloppe } from '../.server/vigie.server.ts';

// Tunnel du SDK Sentry navigateur vers Vigie : contrôles (origine, taille, quota par IP, clé)
// dans app/.server/vigie/navigateur.ts.
export function loader() {
  return new Response(null, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
}

export function action({ request }: { request: Request }) {
  return recevoirEnveloppe(request);
}

import { authIsConfigured } from '../.server/auth/config.ts';
import { requireOwner } from '../.server/auth/owner.server.ts';

async function unavailable() {
  throw new Response('Espace privé indisponible.', { status: 503, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } });
}

export async function loader({ request }: { request: Request }) {
  if (!authIsConfigured()) return unavailable();
  await requireOwner(request);
  throw new Response('Introuvable.', { status: 404, headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' } });
}
export const action = loader;

import { authIsConfigured } from '../.server/auth/config.ts';
import { getAuth } from '../.server/auth/auth.server.ts';

// Connexion et déconnexion passent par le formulaire privé et son action, qui
// appellent `auth.api` côté serveur. Les exposer ici ouvrirait une seconde
// porte de connexion, à une adresse publique et fixe, qui échapperait à la
// limitation par adresse e-mail du formulaire caché.
const allowed = new Set(['GET /get-session']);

function unavailable() {
  return new Response('Service privé indisponible.', {
    status: 503,
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' },
  });
}

async function handle(request: Request) {
  if (!authIsConfigured()) return unavailable();
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '');
  if (!allowed.has(`${request.method} ${path}`)) {
    return new Response('Introuvable.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  return getAuth().auth.handler(request);
}

export const loader = ({ request }: { request: Request }) => handle(request);
export const action = ({ request }: { request: Request }) => handle(request);

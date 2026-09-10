import { getAuth } from './auth.server.ts';

function privateResponse(status: 401 | 403) {
  return new Response('Accès privé refusé.', {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export async function requireOwner(request: Request) {
  const { auth, config } = getAuth();
  const result = await auth.api.getSession({ headers: request.headers });
  if (!result) throw privateResponse(401);
  if (result.user.email.trim().toLowerCase() !== config.FINANCE_OWNER_EMAIL) throw privateResponse(403);
  return result;
}

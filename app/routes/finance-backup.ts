import { createDownloadBackup } from '../.server/db/backup.ts';
import { databasePath } from '../.server/db/config.ts';
import { getAuth } from '../.server/auth/auth.server.ts';
import { authIsConfigured } from '../.server/auth/config.ts';
import { requireOwner } from '../.server/auth/owner.server.ts';
import { securityEventRepository } from '../.server/repositories/security-events.ts';
import { requireSameOrigin } from '../.server/security/same-origin.server.ts';

const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
};

function unavailable() {
  return new Response('Sauvegarde indisponible.', { status: 503, headers: privateHeaders });
}

function tooSoon() {
  return new Response('Patiente une minute avant de demander une autre sauvegarde.', { status: 429, headers: privateHeaders });
}

export function loader() {
  return new Response('Introuvable.', { status: 404, headers: privateHeaders });
}

export async function action({ request }: { request: Request }) {
  if (!authIsConfigured()) return unavailable();
  requireSameOrigin(request);
  const session = await requireOwner(request);
  const { connection } = getAuth();
  const events = securityEventRepository(connection.db, session.user.id);
  const latest = events.latest('backup-download');
  if (latest && Date.now() - Date.parse(latest.createdAt) < 60_000) return tooSoon();
  try {
    const backup = await createDownloadBackup(connection.sqlite, databasePath());
    events.record('backup-download');
    return new Response(backup.bytes, {
      headers: {
        ...privateHeaders,
        'Content-Disposition': `attachment; filename="${backup.filename}"`,
        'Content-Length': String(backup.bytes.byteLength),
        'Content-Type': 'application/vnd.sqlite3',
      },
    });
  } catch {
    return unavailable();
  }
}

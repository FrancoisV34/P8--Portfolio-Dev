import { eq } from 'drizzle-orm';
import { getAuth } from '../../app/.server/auth/auth.server.ts';
import { user } from '../../app/.server/db/schema.ts';

// Diagnostic local sans afficher d'adresse, identifiant, cookie ou secret.
const { connection, config } = getAuth();
try {
  const owner = connection.db.select({ id: user.id }).from(user).where(eq(user.email, config.FINANCE_OWNER_EMAIL)).get();
  console.log(owner ? 'Compte propriétaire configuré : présent.' : 'Compte propriétaire configuré : absent.');
} finally {
  connection.close();
}

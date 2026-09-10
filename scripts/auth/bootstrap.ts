import { eq } from 'drizzle-orm';
import { getAuth } from '../../app/.server/auth/auth.server.ts';
import { user } from '../../app/.server/db/schema.ts';
import { askNewPassword } from './password.ts';

const { auth, connection, config } = getAuth();
try {
  if (connection.db.select().from(user).limit(1).get()) {
    throw new Error('Un compte existe déjà : la commande d’initialisation est refusée.');
  }
  const password = await askNewPassword();
  const response = await auth.api.signUpEmail({
    body: { name: config.FINANCE_OWNER_NAME, email: config.FINANCE_OWNER_EMAIL, password },
    asResponse: true,
  });
  if (!response.ok) throw new Error('La création du compte a échoué. Vérifier la configuration et les migrations.');
  const owner = connection.db.select().from(user).where(eq(user.email, config.FINANCE_OWNER_EMAIL)).get();
  if (!owner) throw new Error('Le compte créé ne correspond pas au propriétaire configuré.');
  console.log('Compte personnel créé. Les inscriptions HTTP restent désactivées.');
} finally {
  connection.close();
}

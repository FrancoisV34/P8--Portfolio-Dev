import { eq } from 'drizzle-orm';
import { hashPassword } from 'better-auth/crypto';
import { getAuth } from '../../app/.server/auth/auth.server.ts';
import { account, session, user } from '../../app/.server/db/schema.ts';
import { askNewPassword } from './password.ts';

const { connection, config } = getAuth();
try {
  const owner = connection.db.select().from(user).where(eq(user.email, config.FINANCE_OWNER_EMAIL)).get();
  if (!owner) throw new Error('Le propriétaire configuré n’existe pas. Utiliser auth:bootstrap une seule fois.');
  const password = await askNewPassword();
  const passwordHash = await hashPassword(password);
  connection.db.transaction((tx) => {
    const credential = tx.select().from(account).where(eq(account.userId, owner.id)).get();
    if (!credential || credential.providerId !== 'credential') throw new Error('Le compte local du propriétaire est introuvable.');
    tx.update(account).set({ password: passwordHash, updatedAt: new Date() }).where(eq(account.id, credential.id)).run();
    return tx.delete(session).where(eq(session.userId, owner.id)).run();
  });
  console.log('Mot de passe remplacé et sessions existantes révoquées.');
} finally {
  connection.close();
}

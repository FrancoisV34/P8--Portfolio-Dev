import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { migrateDatabase } from '../../app/.server/db/migrate';
import { user } from '../../app/.server/db/schema';
import { createAuth } from '../../app/.server/auth/auth.server';

const database = resolve('tests/auth-e2e/auth.sqlite');
const configuration = {
  DATABASE_PATH: database,
  BETTER_AUTH_SECRET: 'test-secret-for-private-finance-12345',
  FINANCE_OWNER_EMAIL: 'owner@example.test',
  FINANCE_OWNER_NAME: 'Propriétaire de test',
  SITE_URL: 'http://127.0.0.1:4175',
};

export default async function setup() {
  if (existsSync(database)) rmSync(database, { force: true });
  Object.assign(process.env, configuration);
  const preparation = openDatabase({ path: database, environment: 'test' });
  migrateDatabase(preparation.db);
  preparation.close();
  const { auth, connection } = createAuth();
  try {
    await auth.api.signUpEmail({
      body: { email: configuration.FINANCE_OWNER_EMAIL, name: configuration.FINANCE_OWNER_NAME, password: 'mot-de-passe-test-123' },
    });
    if (!connection.db.select().from(user).limit(1).get()) throw new Error('Création du propriétaire de test impossible.');
  } finally {
    connection.close();
  }
}

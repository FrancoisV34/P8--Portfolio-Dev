import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { openDatabase } from '../db/connection.ts';
import * as schema from '../db/schema.ts';
import { readAuthConfiguration } from './config.ts';

export function createAuth() {
  const config = readAuthConfiguration();
  const connection = openDatabase();
  const auth = betterAuth({
    baseURL: config.origin,
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [config.origin],
    database: drizzleAdapter(connection.db, {
      // better-sqlite3 exécute ses transactions de façon synchrone alors que
      // Better Auth enchaîne des opérations asynchrones : le mode transaction
      // de l’adaptateur doit rester désactivé pour ce pilote.
      provider: 'sqlite', schema, transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
    },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 60 },
    // Isole les sessions de l'espace financier des cookies Better Auth émis
    // par d'anciennes versions locales. Le changement de préfixe impose une
    // nouvelle connexion, sans réutiliser une session éventuellement ambiguë.
    advanced: {
      cookiePrefix: 'fv-finance-v1',
      // `strict` : le cookie de session n'accompagne aucune requête venue
      // d'un autre site, même en navigation. `secure` reste déduit de
      // l'origine (HTTPS en production, HTTP en local).
      defaultCookieAttributes: { sameSite: 'strict', httpOnly: true },
      // Fly réécrit `fly-client-ip` sur chaque requête entrante : c'est la
      // seule adresse client fiable ici. Sans elle, la limitation de débit
      // de Better Auth retombe sur un compteur unique partagé.
      ipAddress: { ipAddressHeaders: ['fly-client-ip'] },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 20,
      customRules: { '/sign-in/email': { window: 60, max: 5 } },
    },
  });
  return { auth, connection, config };
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  instance ??= createAuth();
  return instance;
}

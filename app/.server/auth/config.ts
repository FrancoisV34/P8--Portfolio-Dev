import { z } from 'zod';
import { siteOrigin } from '../../lib/site.server.ts';

const environment = z.object({
  BETTER_AUTH_SECRET: z.string().min(32),
  FINANCE_OWNER_EMAIL: z.string().trim().pipe(z.email()).transform((email) => email.toLowerCase()),
  FINANCE_OWNER_NAME: z.string().trim().min(1).max(100),
  SITE_URL: z.string().optional(),
});

export type AuthConfiguration = z.infer<typeof environment> & { origin: string };

export function readAuthConfiguration(values: Record<string, string | undefined> = process.env): AuthConfiguration {
  const config = environment.parse(values);
  return { ...config, origin: siteOrigin(config.SITE_URL) };
}

export function authIsConfigured(values: Record<string, string | undefined> = process.env) {
  try {
    readAuthConfiguration(values);
    return true;
  } catch {
    return false;
  }
}

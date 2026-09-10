import { describe, expect, it } from 'vitest';
import { authIsConfigured, readAuthConfiguration } from '../../app/.server/auth/config';

const configured = {
  BETTER_AUTH_SECRET: 'a'.repeat(32),
  FINANCE_OWNER_EMAIL: ' Francois@example.test ',
  FINANCE_OWNER_NAME: 'François Vittecoq',
  SITE_URL: 'https://portfolio.example/',
};

describe('configuration du compte personnel', () => {
  it('normalise l’adresse autorisée et utilise une origine sans chemin', () => {
    expect(readAuthConfiguration(configured)).toMatchObject({
      FINANCE_OWNER_EMAIL: 'francois@example.test',
      origin: 'https://portfolio.example',
    });
  });
  it.each([
    {},
    { ...configured, BETTER_AUTH_SECRET: 'court' },
    { ...configured, FINANCE_OWNER_EMAIL: 'pas-un-email' },
    { ...configured, FINANCE_OWNER_NAME: ' ' },
    { ...configured, SITE_URL: 'https://portfolio.example/sous-dossier' },
  ])('refuse les paramètres manquants ou ambigus', (values) => {
    expect(authIsConfigured(values)).toBe(false);
    expect(() => readAuthConfiguration(values)).toThrow();
  });
});

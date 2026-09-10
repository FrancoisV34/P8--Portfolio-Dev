import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/auth-e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './tests/auth-e2e/setup.ts',
  globalTeardown: './tests/auth-e2e/teardown.ts',
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:4175/healthz',
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      HOST: '127.0.0.1', PORT: '4175',
      SITE_URL: 'http://127.0.0.1:4175',
      DATABASE_PATH: resolve('tests/auth-e2e/auth.sqlite'),
      BETTER_AUTH_SECRET: 'test-secret-for-private-finance-12345',
      FINANCE_OWNER_EMAIL: 'owner@example.test',
      FINANCE_OWNER_NAME: 'Propriétaire de test',
    },
  },
});

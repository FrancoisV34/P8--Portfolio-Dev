import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:4173/healthz',
    reuseExistingServer: false,
    // Isole les tests publics du fichier .env local : ils vérifient bien le
    // comportement fermé (503) lorsqu’aucun compte privé n’est configuré.
    env: {
      HOST: '127.0.0.1', PORT: '4173', SITE_URL: 'http://127.0.0.1:4173',
      BETTER_AUTH_SECRET: '', FINANCE_OWNER_EMAIL: '', FINANCE_OWNER_NAME: '',
    },
    timeout: 30_000,
  },
});

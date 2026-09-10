import { test, expect } from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

let directory: string;
const sentinel = 'PRIVATE_TEST_SENTINEL';

test.beforeAll(() => {
  directory = mkdtempSync(resolve('tests/dev/private-fixture-'));
  // Fichiers synthétiques de test, aucune base réelle ni contenu privé utilisé.
  for (const filename of ['budget.sqlite', 'budget.sqlite-wal', 'budget.sqlite-shm', 'budget.db', '.env']) {
    writeFileSync(join(directory, filename), sentinel);
  }
});
test.afterAll(() => rmSync(directory, { recursive: true, force: true }));

test('Vite refuse les fichiers privés, leurs variantes raw et les URLs /@fs/', async ({ request }) => {
  const paths = [
    '/dossier_conception_cfo/README.md',
    ...['budget.sqlite', 'budget.sqlite-wal', 'budget.sqlite-shm', 'budget.db', '.env'].map((name) => `/${join(directory, name).slice(process.cwd().length + 1)}`),
  ];
  for (const path of paths) {
    for (const url of [path, `${path}?raw`, `/@fs${process.cwd()}${path}`, `${path}?url`]) {
      const response = await request.get(url);
      expect([403, 404], url).toContain(response.status());
      expect(await response.text()).not.toContain(sentinel);
    }
  }
});

test('le portfolio et ses fichiers publics restent accessibles en développement', async ({ request }) => {
  for (const path of ['/', '/cv', '/CVVittecoq.pdf', '/icons/Kasa-home.png']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

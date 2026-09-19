import { expect, test } from '@playwright/test';

test('le serveur pose les en-têtes de sécurité et la page respecte la politique de contenu', async ({ page, request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+'/);
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['cross-origin-opener-policy']).toBe('same-origin');
  expect(headers['permissions-policy']).toContain('camera=()');
  expect(headers['x-powered-by']).toBeUndefined();
  // HSTS ne doit pas sortir sur une connexion locale en clair.
  expect(headers['strict-transport-security']).toBeUndefined();

  // Un nonce différent à chaque requête, sinon il ne protège plus de rien.
  const second = await request.get('/');
  expect(second.headers()['content-security-policy']).not.toBe(headers['content-security-policy']);

  const refusals: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) refusals.push(message.text());
  });
  page.on('pageerror', (error) => refusals.push(String(error)));

  await page.goto('/');
  await page.getByRole('link', { name: 'CV' }).first().click();
  await expect(page).toHaveURL('/cv');
  expect(refusals).toEqual([]);
});

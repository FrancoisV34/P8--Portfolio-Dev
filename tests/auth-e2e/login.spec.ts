import { expect, test } from '@playwright/test';

test('le compte propriétaire peut se connecter et se déconnecter', async ({ page, request }) => {
  // Sans session, l'espace privé et les anciennes adresses de connexion
  // répondent « introuvable » : aucune redirection ne publie /co.
  const privateArea = await page.goto('/finance');
  expect(privateArea?.status()).toBe(404);
  const oldLogin = await page.goto('/login');
  expect(oldLogin?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();

  await page.goto('/co?email=owner%40example.test&password=ne-doit-pas-rester-dans-l-url');
  await expect(page).toHaveURL('/co');

  const signup = await request.post('/api/auth/sign-up/email', { data: { email: 'other@example.test', password: 'mot-de-passe-test-456', name: 'Autre test' } });
  expect(signup.status()).toBe(404);

  await page.goto('/co');
  await page.getByLabel('Adresse e-mail').fill('owner@example.test');
  await page.getByLabel('Mot de passe').fill('mot-de-passe-test-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/finance');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vue d’ensemble');

  await page.goto('/co');
  await expect(page).toHaveURL('/co');
  await expect(page.getByRole('heading', { name: 'Finance privée' })).toBeVisible();
  await page.goto('/finance');

  await page.getByRole('link', { name: 'Comptes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entité économique' })).toBeVisible();
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Journal — 2026-09' })).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page).toHaveURL('/');
  const closed = await page.goto('/finance');
  expect(closed?.status()).toBe(404);
  const session = await page.request.get('/api/auth/get-session');
  expect(session.status()).toBe(200);
  expect(await session.json()).toBeNull();
});

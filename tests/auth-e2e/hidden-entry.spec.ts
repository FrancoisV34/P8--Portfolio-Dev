import { expect, test } from '@playwright/test';

test('trois clics sur le copyright ouvrent un champ discret, sans que la page révèle l’adresse privée', async ({ page, request }) => {
  const html = await (await request.get('/')).text();
  expect(html).not.toMatch(/["']\/co["']/);

  await page.goto('/');
  const mark = page.locator('.contact-footer__mark');
  const code = page.getByLabel('Code');
  await expect(code).toHaveCount(0);

  // Un ou deux clics ne suffisent pas ; Échap referme le champ.
  await mark.click({ clickCount: 2 });
  await expect(code).toHaveCount(0);
  await page.waitForTimeout(900);
  await mark.click({ clickCount: 3 });
  await expect(code).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(code).toHaveCount(0);

  // Un mauvais code mène à la même page qu'une adresse inconnue.
  await mark.click({ clickCount: 3 });
  await code.fill('pas-le-bon');
  await code.press('Enter');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();

  await page.goto('/');
  await mark.click({ clickCount: 3 });
  await code.fill('co');
  await code.press('Enter');
  await expect(page).toHaveURL('/co');
  await expect(page.getByRole('heading', { name: 'Finance privée' })).toBeVisible();
});

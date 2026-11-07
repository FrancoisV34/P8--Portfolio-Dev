import { expect, test } from '@playwright/test';
import { attendreChassis } from './chassis';

/**
 * La courbe des 120 mois, vue sur un téléphone.
 *
 * Le graphique était un SVG mis à l'échelle en entier : à 375 px de large, ses
 * étiquettes tombaient à 4 px. Le tracé s'étire désormais seul ; le texte garde
 * sa taille. Et une trajectoire qui passe sous zéro doit le montrer.
 */
test('sur mobile, la courbe des simulations reste lisible et marque le passage sous zéro', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/co');
  await page.getByLabel('Adresse e-mail').fill('owner@example.test');
  await page.getByLabel('Mot de passe').fill('mot-de-passe-test-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/finance');
  await attendreChassis(page);

  await page.goto('/finance/simulations');
  const hypotheses = page.locator('form:has(input[value="saveSimulation"])');
  // 400 € de déficit par mois depuis 24 000 € : le patrimoine passe sous zéro.
  await hypotheses.locator('input[name="openingHouseholdCash"]').fill('24000,00');
  await hypotheses.locator('input[name="monthlyHouseholdIncome"]').fill('2000,00');
  await hypotheses.locator('input[name="monthlyHouseholdExpense"]').fill('2400,00');
  await page.getByRole('button', { name: 'Créer une révision d’hypothèses' }).click();
  await page.getByRole('button', { name: 'Lancer la simulation' }).click();

  const courbe = page.locator('.finance-records > li').first().locator('figure.finance-chart');
  await expect(courbe.locator('.finance-chart__zero')).toHaveCount(1);
  await expect(courbe.locator('.finance-chart__label--valeur.finance-chart__label--last')).toHaveText(/^−\d+ k€$/);

  const cadre = (await courbe.boundingBox())!;
  const etiquettes = courbe.locator('.finance-chart__label:visible');
  expect(await etiquettes.count()).toBeGreaterThanOrEqual(4);
  for (const etiquette of await etiquettes.all()) {
    const taille = await etiquette.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    expect(taille).toBeGreaterThanOrEqual(10);
    // Aucune étiquette ne déborde du graphique, sinon elle est coupée ou
    // provoque un défilement latéral.
    const boite = (await etiquette.boundingBox())!;
    expect(boite.x).toBeGreaterThanOrEqual(cadre.x - 1);
    expect(boite.x + boite.width).toBeLessThanOrEqual(cadre.x + cadre.width + 1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

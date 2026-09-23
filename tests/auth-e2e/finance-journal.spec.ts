import { expect, test, type Page } from '@playwright/test';

/**
 * Le journal et la saisie rapide, dans le vrai châssis.
 *
 * Ces trois comportements ne se prouvent pas par un test unitaire : ils vivent
 * dans le focus, le clavier et la bascule de gabarit. Ce qui est vérifié ici est
 * ce qui rend l'outil utilisable sans souris — et donc ce qui casse en silence.
 */

async function connexion(page: Page) {
  await page.goto('/co');
  await page.getByLabel('Adresse e-mail').fill('owner@example.test');
  await page.getByLabel('Mot de passe').fill('mot-de-passe-test-123');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL('/finance');
}

async function decor(page: Page) {
  await page.getByRole('link', { name: 'Comptes', exact: true }).click();

  await page.locator('form:has(input[value="createEntity"]) input[name="name"]').fill('Foyer');
  await page.getByRole('button', { name: 'Ajouter l’entité' }).click();
  // Le seul signe qui compte : l'entité est choisissable pour un compte.
  await expect(page.locator('select[name="entityId"] option').filter({ hasText: 'Foyer' })).toHaveCount(1);

  await page.locator('form:has(input[value="createAccount"]) input[name="name"]').fill('Compte courant');
  await page.locator('form:has(input[value="createAccount"]) input[name="openingBalance"]').fill('1000,00');
  await page.getByRole('button', { name: 'Ajouter le compte' }).click();
  await expect(page.locator('[data-view="table"] tbody td:first-child').getByText('Compte courant', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Catégories', exact: true }).click();
  for (const [nom, nature] of [['Courses', 'expense'], ['Salaire', 'income']] as const) {
    await page.locator('form:has(input[value="createCategory"]) input[name="name"]').fill(nom);
    await page.locator('form:has(input[value="createCategory"]) select[name="kind"]').selectOption(nature);
    await page.getByRole('button', { name: 'Ajouter la catégorie' }).click();
    await expect(page.locator('[data-view="table"] tbody td:first-child').getByText(nom, { exact: true })).toBeVisible();
  }
}

test.describe.configure({ mode: 'serial' });

test('la modale N enchaîne les saisies, le journal se trie et se parcourt au clavier', async ({ page }) => {
  await connexion(page);
  await decor(page);
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Journal — 2026-09' })).toBeVisible();

  // ── `N` ouvre la modale, et le focus part sur Montant ───────────────────
  await page.locator('body').press('n');
  const modale = page.getByRole('dialog');
  await expect(modale).toBeVisible();
  await expect(modale.getByLabel('Montant (€)')).toBeFocused();

  // ── ⌘↵ enregistre, « Enchaîner » garde la modale et vide le montant ─────
  const montant = modale.getByLabel('Montant (€)');
  await expect(modale.getByLabel('Enchaîner les saisies')).toBeChecked();

  for (const valeur of ['12,50', '30,00', '7,20']) {
    await montant.fill(valeur);
    await montant.press('Meta+Enter');
    await expect(montant).toHaveValue('');
  }
  await expect(modale).toBeVisible();
  await expect(modale.getByText('3 mouvements enregistrés.')).toBeVisible();

  // ── Un montant refusé s'explique SOUS le champ, et rien n'est envoyé ────
  await montant.fill('douze euros');
  await montant.press('Meta+Enter');
  const erreur = modale.locator('.finance-field-error');
  await expect(erreur).toBeVisible();
  await expect(montant).toHaveAttribute('aria-invalid', 'true');
  await expect(modale.getByText('3 mouvements enregistrés.')).toBeVisible();

  // ── Échap ferme et rend le focus au bouton qui a ouvert ─────────────────
  await montant.fill('');
  await page.keyboard.press('Escape');
  await expect(modale).toBeHidden();

  // ── Les trois mouvements sont au journal ────────────────────────────────
  const lignes = page.locator('[data-view="table"] tbody tr');
  await expect(lignes).toHaveCount(3);

  // ── Tri par montant : croissant puis décroissant ────────────────────────
  const montants = page.locator('[data-view="table"] tbody td.num:not(:last-child)');
  await page.getByRole('button', { name: /^Montant/ }).click();
  await expect(page.locator('[data-view="table"] th[aria-sort="descending"]')).toHaveText(/Montant/);
  const decroissant = await montants.allInnerTexts();

  await page.getByRole('button', { name: /^Montant/ }).click();
  await expect(page.locator('[data-view="table"] th[aria-sort="ascending"]')).toHaveText(/Montant/);
  const croissant = await montants.allInnerTexts();
  expect(croissant).toEqual([...decroissant].reverse());

  // Toutes des dépenses : la plus grosse est la plus négative, donc première
  // en ordre croissant. Un tri en valeur absolue la mettrait dernière.
  expect(croissant[0]).toContain('30,00');

  // ── Clavier : les flèches circulent, Entrée ouvre la correction ─────────
  await lignes.first().focus();
  await expect(lignes.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(lignes.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  // ⚠️ Bornée, pas bouclée : une flèche haut sur la première ligne y reste.
  await expect(lignes.first()).toHaveAttribute('aria-selected', 'true');

  await page.keyboard.press('Enter');
  await expect(page.locator('.finance-table__edition')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.finance-table__edition')).toBeHidden();
});

test('sous 680 px le tableau cède la place aux lignes dépliables', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 780 });
  await connexion(page);
  await page.goto('/finance/transactions?period=2026-09');

  await expect(page.locator('[data-view="table"]')).toBeHidden();
  const cartes = page.locator('[data-view="cards"]');
  await expect(cartes).toBeVisible();
  // La page ne défile jamais latéralement : c'est ce que le tableau aurait fait.
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(debordement).toBeLessThanOrEqual(0);
});

test('les tableaux denses des autres sections se trient et déplient leur correction', async ({ page }) => {
  await connexion(page);
  await page.getByRole('link', { name: 'Catégories', exact: true }).click();

  const tableau = page.locator('[data-view="table"]');
  const noms = tableau.locator('tbody tr td:first-child');
  await expect(noms).toHaveText(['Courses', 'Salaire']);

  // Un premier clic sur une colonne de texte trie de A à Z, le second inverse.
  await tableau.getByRole('button', { name: /^Catégorie/ }).click();
  await expect(tableau.locator('th[aria-sort="ascending"]')).toHaveText(/Catégorie/);
  await tableau.getByRole('button', { name: /^Catégorie/ }).click();
  await expect(noms).toHaveText(['Salaire', 'Courses']);

  // « Modifier » déplie la correction sous SA ligne, et la replie.
  const modifier = tableau.getByRole('row', { name: /Courses/ }).getByRole('button', { name: 'Modifier' });
  await modifier.click();
  await expect(modifier).toHaveAttribute('aria-expanded', 'true');
  await expect(tableau.locator('.finance-table__edition input[name="name"]')).toHaveValue('Courses');
  await modifier.click();
  await expect(tableau.locator('.finance-table__edition')).toHaveCount(0);

  // Les soldes de la synthèse gardent leur ligne de total.
  await page.getByRole('link', { name: 'Synthèse', exact: true }).click();
  const soldes = page.locator('.finance-card', { has: page.getByRole('heading', { name: 'Soldes à la fin de la période' }) }).locator('[data-view="table"]');
  await expect(soldes.locator('tfoot')).toContainText('Total');
});

test('sous 680 px les tableaux denses deviennent des cartes, sans défilement latéral', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 780 });
  await connexion(page);
  for (const section of ['accounts', 'categories', 'budget']) {
    await page.goto(`/finance/${section}?period=2026-09`);
    for (const vue of await page.locator('[data-view="table"]').all()) await expect(vue).toBeHidden();
    await expect(page.locator('[data-view="cards"]').first()).toBeVisible();
    const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(debordement, section).toBeLessThanOrEqual(0);
  }
});

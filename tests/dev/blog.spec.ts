import { expect, test } from '@playwright/test';

// En développement, le modèle en brouillon s'affiche : c'est le seul moyen de
// vérifier le rendu d'un article avant d'en publier un.
test('le blog liste et rend un article, marqué brouillon, avec ses métadonnées de partage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Blog' }).click();
  await expect(page).toHaveURL('/blog');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blog');
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-fv-Desktop-Projet-P8--Portfolio-Dev/d29205fb-4c43-423f-ba3c-f1ae0db86473/scratchpad/blog-liste.png', fullPage: true });
  await page.locator('.blog-card h2 a').first().click();
  await expect(page).toHaveURL('/blog/modele-d-article');
  await expect(page.getByText('Brouillon').first()).toBeVisible();
  await expect(page.locator('.blog-article__body h2')).toHaveText('Un intertitre');
  await expect(page.locator('.blog-article__body pre code')).toContainText('un bloc de code');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/blog\/modele-d-article$/);
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-fv-Desktop-Projet-P8--Portfolio-Dev/d29205fb-4c43-423f-ba3c-f1ae0db86473/scratchpad/blog-article.png', fullPage: true });
});

test('sur 320 px, le lien Blog tient dans la navigation sans débordement', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/blog/modele-d-article');
  for (const link of await page.getByRole('navigation').getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.screenshot({ path: '/private/tmp/claude-501/-Users-fv-Desktop-Projet-P8--Portfolio-Dev/d29205fb-4c43-423f-ba3c-f1ae0db86473/scratchpad/blog-mobile.png', fullPage: true });
});

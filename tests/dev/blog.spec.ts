import { expect, test } from '@playwright/test';

// En développement, les brouillons s'affichent : c'est ainsi qu'on vérifie le
// rendu d'un article avant de le publier.
const ARTICLE = '/blog/orchestrer-l-ia-ce-que-je-verifie';
const SHOTS = process.env.BLOG_SHOTS;

test('l’index met le dernier article à la une et les précédents en lignes', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Blog' }).click();
  await expect(page).toHaveURL('/blog');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blog');
  await expect(page.locator('.blog-featured h2')).toHaveText(/Orchestrer l'IA/);
  await expect(page.locator('.blog-row')).toHaveCount(1);
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href', '/blog/rss.xml');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/index.png`, fullPage: true });
});

test('l’article a son sommaire, sa progression, ses sections numérotées et ses métadonnées', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(ARTICLE);
  const rail = page.getByRole('navigation', { name: 'Sommaire de l’article' });
  await expect(rail.getByRole('link')).toHaveCount(5);
  await expect(page.locator('.blog-section__number').first()).toHaveText('01');
  await expect(page.locator('.blog-quote__label')).toHaveText('Ce que je retiens');
  await expect(page.locator('.blog-code__file')).toHaveText('lecture-pdf.ts');
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain('"BlogPosting"');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/article-haut.png` });

  // Le sommaire suit la lecture : clic sur la 3e section, elle devient active.
  await rail.getByRole('link', { name: /Vérifier les vérifications/ }).click();
  await expect(page).toHaveURL(/#verifier-les-verifications$/);
  await expect(rail.locator('[aria-current="location"]')).toContainText('Vérifier les vérifications');
  await expect(page.locator('.blog-rail [data-reading-text]')).not.toHaveText('0 %');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/article-milieu.png` });

  // « Copier » n'apparaît qu'avec un presse-papiers.
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('.blog-code__copy').click();
  await expect(page.locator('.blog-code__copy')).toHaveText('Copié');
});

test('sous 1040 px, le sommaire devient un details natif ; sur 320 px, rien ne déborde', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(ARTICLE);
  await expect(page.locator('.blog-rail')).toBeHidden();
  const details = page.locator('.blog-toc-mobile');
  await expect(details).toBeVisible();
  await details.locator('summary').click();
  await expect(details.getByRole('link')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  for (const link of await page.getByRole('navigation').first().getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/article-mobile.png`, fullPage: true });
  await page.goto('/blog');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/index-mobile.png`, fullPage: true });
});

test('sans JavaScript, tout le contenu est visible d’emblée', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto(ARTICLE);
  for (const selector of ['.blog-article__head h1', '.blog-section h2', '.blog-quote', '.blog-code', '.blog-article__foot']) {
    await expect(page.locator(selector).first(), selector).toHaveCSS('opacity', '1');
  }
  await expect(page.locator('.blog-code__copy')).toHaveCount(0);
  await context.close();
});

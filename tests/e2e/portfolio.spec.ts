import { expect, test } from '@playwright/test';

test('accueil, CV, ancres et images fonctionnent sans erreur de rendu', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('orchestrateur IA');
  await page.getByRole('navigation').getByRole('link', { name: 'CV', exact: true }).click();
  await expect(page).toHaveURL('/cv');
  await expect(page).toHaveTitle('CV — François Vittecoq, dev & orchestrateur IA');
  await expect(page.locator('iframe')).toHaveAttribute('src', '/CVVittecoq.pdf');
  await page.getByRole('navigation').getByRole('link', { name: 'Projets', exact: true }).click();
  await expect(page).toHaveURL('/#projets');
  await expect(page.locator('#projets')).toBeInViewport();
  for (const image of await page.locator('.project-section__image').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await expect(page.getByRole('link', { name: 'Email', exact: true })).toHaveAttribute('href', 'mailto:fra.vittecoq@gmail.com');
  expect(errors).toEqual([]);
});

test('le contenu et les métadonnées sont lisibles sans JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('opacity', '1');
  await expect(page.locator('.project-section__body').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/`);
  await page.goto('/cv');
  await expect(page).toHaveTitle('CV — François Vittecoq, dev & orchestrateur IA');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${baseURL}/cv`);
  await page.getByRole('navigation').getByRole('link', { name: 'Contact', exact: true }).click();
  await expect(page).toHaveURL('/#contact');
  await expect(page.locator('#contact')).toBeInViewport();
  await context.close();
});

test('navigation accessible sur petit écran et animations réduites', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused();
  for (const link of await page.getByRole('navigation').getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
});

test('les documents publics et la 404 ont les bons statuts', async ({ request, page, baseURL }) => {
  const pdf = await request.get('/CVVittecoq.pdf');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain(`<loc>${baseURL}/cv</loc>`);
  expect(xml).not.toMatch(/finance|gomining|budget/i);
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /finance');
  for (const path of ['/inconnue', '/index.html', '/404.html']) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page introuvable');
  }
});

test('aucune route financière ne permet de lire ou écrire avant installation de la connexion', async ({ request, page }) => {
  for (const path of ['/finance', '/finance/budget', '/finance/gomining', '/api/finance', '/api/finance/transactions']) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await request.fetch(path, { method });
      expect(response.status(), `${method} ${path}`).toBe(503);
      expect(response.headers()['cache-control']).toContain('no-store');
      expect(response.headers()['x-robots-tag']).toContain('noindex');
      expect(await response.text()).not.toMatch(/sqlite|secret|stack trace|solde/i);
    }
  }
  const dataResponse = await request.get('/finance/budget.data');
  expect(dataResponse.status()).toBe(503);
  expect(dataResponse.headers()['cache-control']).toContain('no-store');
  await page.goto('/finance/budget');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Espace privé indisponible');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

import { expect, test } from '@playwright/test';

test('une requête reçue sous un autre nom est renvoyée vers l’adresse configurée', async ({ request, baseURL }) => {
  const moved = await request.get('/blog?ref=ancien', { headers: { host: 'ancien.fly.dev' }, maxRedirects: 0 });
  expect(moved.status()).toBe(308);
  expect(moved.headers().location).toBe(`${baseURL}/blog?ref=ancien`);
  // La réponse de redirection garde les en-têtes de sécurité.
  expect(moved.headers()['x-frame-options']).toBe('DENY');

  // Un formulaire envoyé à l'ancienne adresse n'est pas traité : il est renvoyé tel quel.
  const post = await request.post('/finance', { headers: { host: 'ancien.fly.dev' }, maxRedirects: 0 });
  expect(post.status()).toBe(308);

  const health = await request.get('/healthz', { headers: { host: '172.19.0.2:3000' }, maxRedirects: 0 });
  expect(health.status()).toBe(200);

  expect((await request.get('/', { maxRedirects: 0 })).status()).toBe(200);
});

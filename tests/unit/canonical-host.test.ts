import { describe, expect, it } from 'vitest';
import { canonicalRedirect } from '../../app/.server/security/canonical-host.server';

const origin = 'https://portfolio.example';

describe('adresse publique unique', () => {
  it('sert normalement l’hôte configuré, quelle que soit sa casse', () => {
    expect(canonicalRedirect('portfolio.example', '/blog', origin)).toBeNull();
    expect(canonicalRedirect('Portfolio.EXAMPLE', '/blog', origin)).toBeNull();
  });

  it('renvoie l’ancienne adresse et www vers le même chemin sur l’hôte configuré', () => {
    expect(canonicalRedirect('ancien.fly.dev', '/blog/article?ref=linkedin', origin))
      .toBe('https://portfolio.example/blog/article?ref=linkedin');
    expect(canonicalRedirect('www.portfolio.example', '/', origin)).toBe('https://portfolio.example/');
  });

  it('ne laisse jamais le Host ni la cible de la requête choisir la destination', () => {
    expect(canonicalRedirect('evil.example', '/', origin)).toBe('https://portfolio.example/');
    expect(canonicalRedirect(undefined, '/cv', origin)).toBe('https://portfolio.example/cv');
    for (const target of ['//evil.example/x', 'http://evil.example/x', '/\\evil.example/x', 'http://[']) {
      expect(new URL(canonicalRedirect('ancien.fly.dev', target, origin)!).host).toBe('portfolio.example');
    }
  });

  it('ne redirige jamais le contrôle de santé', () => {
    expect(canonicalRedirect('172.19.0.2:3000', '/healthz', origin)).toBeNull();
  });

  it('compare aussi le port d’une origine locale', () => {
    expect(canonicalRedirect('127.0.0.1:4175', '/', 'http://127.0.0.1:4175')).toBeNull();
    expect(canonicalRedirect('localhost:4175', '/', 'http://127.0.0.1:4175')).toBe('http://127.0.0.1:4175/');
  });
});

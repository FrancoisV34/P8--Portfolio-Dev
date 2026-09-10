import { describe, expect, it } from 'vitest';
import { siteOrigin } from '../../app/lib/site.server';

describe('origine publique configurée', () => {
  it('conserve un port local et normalise une origine HTTPS', () => {
    expect(siteOrigin('http://localhost:5173/')).toBe('http://localhost:5173');
    expect(siteOrigin('https://portfolio.example/')).toBe('https://portfolio.example');
  });

  it.each([
    'not a url', 'javascript:alert(1)', 'ftp://portfolio.example',
    'https://user:secret@portfolio.example', 'https://portfolio.example/ancien-site/',
    'https://portfolio.example/?token=private', 'https://portfolio.example/#private',
  ])('refuse une configuration ambiguë ou non publique : %s', (value) => {
    expect(() => siteOrigin(value)).toThrow();
  });
});

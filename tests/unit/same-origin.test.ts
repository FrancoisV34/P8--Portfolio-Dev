import { describe, expect, it } from 'vitest';
import { requireSameOrigin } from '../../app/.server/security/same-origin.server';
import { siteOrigin } from '../../app/lib/site.server';

describe('protection des mutations financières', () => {
  it('accepte uniquement l’origine configurée', () => {
    const origin = siteOrigin();
    expect(() => requireSameOrigin(new Request(`${origin}/finance`, { method: 'POST', headers: { origin } }))).not.toThrow();
    expect(() => requireSameOrigin(new Request(`${origin}/finance`, { method: 'POST', headers: { origin: 'https://outside.example' } }))).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => requireSameOrigin(new Request(`${origin}/finance`, { method: 'POST' }))).toThrow(expect.objectContaining({ status: 403 }));
  });
});

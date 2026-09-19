import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, securityHeaders } from '../../app/.server/security/headers.server';

describe('en-têtes de sécurité', () => {
  it('interdit l’encadrement, les plugins et les formulaires vers un autre site', () => {
    const policy = contentSecurityPolicy('abc123');
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'self'");
    expect(securityHeaders({ nonce: 'abc123', secure: true })['X-Frame-Options']).toBe('DENY');
  });

  it('autorise les scripts par nonce et jamais par unsafe-inline ou unsafe-eval', () => {
    const policy = contentSecurityPolicy('abc123');
    const scripts = policy.split('; ').find((directive) => directive.startsWith('script-src '));
    expect(scripts).toBe("script-src 'self' 'nonce-abc123'");
    expect(policy).not.toContain('unsafe-eval');
  });

  it('laisse passer la feuille et les fontes Google utilisées par le portfolio', () => {
    const policy = contentSecurityPolicy('abc123');
    expect(policy).toContain('style-src ');
    expect(policy).toContain('https://fonts.googleapis.com');
    expect(policy).toContain('font-src ');
    expect(policy).toContain('https://fonts.gstatic.com');
    expect(policy).toContain("frame-src 'self'");
  });

  it('n’envoie HSTS qu’en HTTPS', () => {
    expect(securityHeaders({ nonce: 'a', secure: true })['Strict-Transport-Security']).toContain('max-age=63072000');
    expect(securityHeaders({ nonce: 'a', secure: false })).not.toHaveProperty('Strict-Transport-Security');
  });

  it('pose les protections d’isolement et de référent', () => {
    const headers = securityHeaders({ nonce: 'a', secure: true });
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(headers['X-Permitted-Cross-Domain-Policies']).toBe('none');
    expect(headers['Permissions-Policy']).toContain('camera=()');
    expect(headers['Permissions-Policy']).toContain('geolocation=()');
  });
});

import { describe, expect, it } from 'vitest';
import { createLoginThrottle } from '../../app/.server/security/login-throttle.server';

function throttleAt(time: { value: number }) {
  return createLoginThrottle({ windowMs: 60_000, maxPerEmail: 3, maxGlobal: 5, now: () => time.value });
}

describe('limitation des tentatives de connexion', () => {
  it('bloque après le quota d’échecs pour une adresse', () => {
    const time = { value: 0 };
    const throttle = throttleAt(time);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(throttle.retryAfter('owner@example.test')).toBe(0);
      throttle.fail('owner@example.test');
    }
    expect(throttle.retryAfter('owner@example.test')).toBeGreaterThan(0);
  });

  it('rouvre l’accès une fois la fenêtre passée', () => {
    const time = { value: 0 };
    const throttle = throttleAt(time);
    for (let attempt = 0; attempt < 3; attempt += 1) throttle.fail('owner@example.test');
    time.value = 59_000;
    expect(throttle.retryAfter('owner@example.test')).toBe(1);
    time.value = 60_001;
    expect(throttle.retryAfter('owner@example.test')).toBe(0);
  });

  it('efface le compteur après une connexion réussie', () => {
    const time = { value: 0 };
    const throttle = throttleAt(time);
    for (let attempt = 0; attempt < 3; attempt += 1) throttle.fail('owner@example.test');
    throttle.succeed('owner@example.test');
    expect(throttle.retryAfter('owner@example.test')).toBe(0);
  });

  it('borne aussi les essais répartis sur des adresses inventées', () => {
    const time = { value: 0 };
    const throttle = throttleAt(time);
    for (let attempt = 0; attempt < 5; attempt += 1) throttle.fail(`inconnu-${attempt}@example.test`);
    expect(throttle.retryAfter('encore-un@example.test')).toBeGreaterThan(0);
  });
});

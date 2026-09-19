import { describe, expect, it } from 'vitest';
import { isPrivateLoginPath, privateLoginPath } from '../../app/.server/security/private-path.server';

describe('adresse de la connexion privée', () => {
  it('garde /co par défaut et accepte un segment configuré', () => {
    expect(privateLoginPath(undefined)).toBe('/co');
    expect(privateLoginPath('  /b3f1a9c2-prive  ')).toBe('/b3f1a9c2-prive');
  });

  it('refuse un chemin qui ne serait pas un segment simple', () => {
    for (const value of ['co', '/', '/a', '/deux/segments', '/avec espace', '/../etc', '/x?y']) {
      expect(() => privateLoginPath(value), value).toThrow();
    }
  });

  it('reconnaît l’adresse configurée, y compris la requête de données', () => {
    expect(isPrivateLoginPath('/b3f1a9c2', '/b3f1a9c2')).toBe(true);
    expect(isPrivateLoginPath('/b3f1a9c2.data', '/b3f1a9c2')).toBe(true);
    expect(isPrivateLoginPath('/b3f1a9c2/', '/b3f1a9c2')).toBe(true);
  });

  it('rejette toute autre adresse, dont l’ancienne', () => {
    for (const value of ['/co', '/login', '/b3f1a9c3', '/b3f1a9c2x', '/']) {
      expect(isPrivateLoginPath(value, '/b3f1a9c2'), value).toBe(false);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { hiddenEntryPath } from '../../app/lib/private-path-shape';

describe('entrée discrète du pied de page', () => {
  it('accepte le code avec ou sans barre oblique', () => {
    expect(hiddenEntryPath('b3f1a9c2')).toBe('/b3f1a9c2');
    expect(hiddenEntryPath(' /b3f1a9c2 ')).toBe('/b3f1a9c2');
    // Les barres en tête sont retirées : le résultat reste un chemin de ce site.
    expect(hiddenEntryPath('//evil.example')).toBe('/evil.example');
  });

  it.each(['', 'a', 'https://evil.example', 'a/b', '../finance', 'code?x=1', 'javascript:alert(1)'])(
    'refuse ce qui ne peut pas être une adresse privée : %s',
    (code) => expect(hiddenEntryPath(code)).toBeNull(),
  );
});

import { describe, expect, it } from 'vitest';

import { nextTableSort, sortRows } from '../../app/lib/finance/table';

type Ligne = { id: string; nom: string; cents: number | null };
const lignes: Ligne[] = [
  { id: 'a', nom: 'Zoo', cents: 900 },
  { id: 'b', nom: 'Édition', cents: null },
  { id: 'c', nom: 'avance', cents: 100_000 },
  { id: 'd', nom: 'Banque', cents: -50_000 },
];

describe('tri des tableaux denses', () => {
  it('trie les montants comme des nombres signés, pas comme du texte', () => {
    expect(sortRows(lignes, (l) => l.cents, 'desc').map((l) => l.id)).toEqual(['c', 'a', 'd', 'b']);
  });

  it('laisse une valeur inconnue en dernier, quel que soit le sens', () => {
    expect(sortRows(lignes, (l) => l.cents, 'asc').map((l) => l.id)).toEqual(['d', 'a', 'c', 'b']);
  });

  it('range les libellés accentués à leur lettre, sans tenir compte de la casse', () => {
    expect(sortRows(lignes, (l) => l.nom, 'asc').map((l) => l.nom)).toEqual(['avance', 'Banque', 'Édition', 'Zoo']);
  });

  it('garde l’ordre d’entrée à valeur égale et ne modifie pas le tableau source', () => {
    const egales = [{ id: '1', v: 5 }, { id: '2', v: 5 }, { id: '3', v: 1 }];
    const copie = egales.slice();
    expect(sortRows(egales, (l) => l.v, 'desc').map((l) => l.id)).toEqual(['1', '2', '3']);
    expect(egales).toEqual(copie);
  });

  it('commence une colonne numérique par le plus grand, une colonne de texte par A, puis inverse', () => {
    expect(nextTableSort(null, 'cents', true)).toEqual({ column: 'cents', direction: 'desc' });
    expect(nextTableSort(null, 'nom', false)).toEqual({ column: 'nom', direction: 'asc' });
    expect(nextTableSort({ column: 'nom', direction: 'asc' }, 'nom', false)).toEqual({ column: 'nom', direction: 'desc' });
    expect(nextTableSort({ column: 'nom', direction: 'asc' }, 'cents', true)).toEqual({ column: 'cents', direction: 'desc' });
  });
});

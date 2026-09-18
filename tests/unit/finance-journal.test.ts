import { describe, expect, it } from 'vitest';

import { moveSelection, nextSort, sortJournal, type JournalRow } from '../../app/lib/finance/journal';

/**
 * Le tri du journal, et les trois façons dont il pourrait mentir sans qu'on le
 * voie : trier des montants comme du texte, ignorer leur signe, et ranger les
 * libellés accentués à la fin de l'alphabet.
 */

function row(partial: Partial<JournalRow> & { id: string }): JournalRow {
  return { date: '2026-09-01', label: '', account: '', category: '', amountCents: 0, ...partial };
}

describe('tri du journal', () => {
  it('range les montants par valeur signée, pas comme du texte ni en valeur absolue', () => {
    const rows = [
      row({ id: 'petit', amountCents: 900 }),
      row({ id: 'grosse-depense', amountCents: -50_000 }),
      row({ id: 'gros', amountCents: 100_000 }),
      row({ id: 'recette', amountCents: 50_000 }),
    ];

    const ordre = sortJournal(rows, { column: 'amount', direction: 'desc' }).map((r) => r.id);

    // Un tri sur le montant FORMATÉ mettrait « 1 000,00 € » avant « 9,00 € ».
    // Un tri sur la VALEUR ABSOLUE collerait la dépense de 500 € juste à côté
    // de la recette de 500 € : ici elle doit finir dernière, et elle seule.
    expect(ordre).toEqual(['gros', 'recette', 'petit', 'grosse-depense']);
  });

  it('range les libellés accentués à leur lettre, pas après Z', () => {
    const rows = [
      row({ id: 'z', label: 'Zoo' }),
      row({ id: 'e-accent', label: 'Édition' }),
      row({ id: 'e', label: 'Emploi' }),
    ];

    // Une comparaison naïve par `<` classe « Édition » (U+00C9) après « Zoo ».
    expect(sortJournal(rows, { column: 'label', direction: 'asc' }).map((r) => r.id))
      .toEqual(['e-accent', 'e', 'z']);
  });

  it('conserve l’ordre d’entrée entre deux lignes de même valeur', () => {
    // Deux mouvements du même jour : ils doivent rester dans l'ordre reçu du
    // serveur (saisie la plus récente d'abord) au lieu de permuter d'un rendu à
    // l'autre sous l'œil de qui les relit.
    const rows = [
      row({ id: 'saisi-en-second', date: '2026-09-04' }),
      row({ id: 'saisi-en-premier', date: '2026-09-04' }),
      row({ id: 'la-veille', date: '2026-09-03' }),
    ];

    expect(sortJournal(rows, { column: 'date', direction: 'desc' }).map((r) => r.id))
      .toEqual(['saisi-en-second', 'saisi-en-premier', 'la-veille']);
  });

  it('ne touche jamais au tableau reçu', () => {
    // Les lignes viennent de `useLoaderData` : les trier sur place corromprait
    // le cache du routeur.
    const rows = [row({ id: 'b', amountCents: 200 }), row({ id: 'a', amountCents: 100 })];
    const avant = rows.map((r) => r.id);

    sortJournal(rows, { column: 'amount', direction: 'asc' });

    expect(rows.map((r) => r.id)).toEqual(avant);
  });

  it('inverse la même colonne et donne à chaque nouvelle colonne son sens utile', () => {
    const date: ReturnType<typeof nextSort> = { column: 'date', direction: 'desc' };

    expect(nextSort(date, 'date')).toEqual({ column: 'date', direction: 'asc' });
    // Un montant se cherche du plus gros au plus petit ; un libellé, de A à Z.
    expect(nextSort(date, 'amount')).toEqual({ column: 'amount', direction: 'desc' });
    expect(nextSort(date, 'label')).toEqual({ column: 'label', direction: 'asc' });
  });
});

describe('sélection au clavier', () => {
  it('s’arrête aux extrémités au lieu de reboucler', () => {
    // ⚠️ La propriété qui compte. Sur 250 lignes, une flèche bas qui repart en
    // haut déplace la sélection hors de l'écran : on croit corriger le dernier
    // mouvement, on ouvre le premier.
    expect(moveSelection(9, 'ArrowDown', 10)).toBe(9);
    expect(moveSelection(0, 'ArrowUp', 10)).toBe(0);
  });

  it('entre dans la liste par le bout d’où l’on vient', () => {
    expect(moveSelection(null, 'ArrowDown', 10)).toBe(0);
    expect(moveSelection(null, 'ArrowUp', 10)).toBe(9);
  });

  it('va aux extrémités avec Début et Fin, et ignore le reste', () => {
    expect(moveSelection(4, 'Home', 10)).toBe(0);
    expect(moveSelection(4, 'End', 10)).toBe(9);
    expect(moveSelection(4, 'PageDown', 10)).toBe(4);
  });

  it('ne sélectionne rien dans un journal vide', () => {
    expect(moveSelection(null, 'ArrowDown', 0)).toBeNull();
    expect(moveSelection(3, 'End', 0)).toBeNull();
  });
});

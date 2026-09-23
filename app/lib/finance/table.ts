/**
 * Le tri des tableaux denses — la version générique de celui du journal.
 *
 * Même raison d'être hors React : c'est la partie qui peut mentir sans se voir.
 * Chaque colonne triable fournit une **clé de tri** distincte de ce qu'elle
 * affiche : on trie des centimes et des dates ISO, jamais du texte formaté.
 */

import type { SortDirection } from './journal.ts';

export type TableSort = { column: string; direction: SortDirection };
/** `null` = valeur inconnue (« non renseigné ») : toujours rangée en dernier. */
export type SortKey = string | number | null;

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/**
 * Le tri qui suit un clic sur un en-tête. Une colonne numérique commence par
 * le plus grand, une colonne de texte par A — même règle que le journal.
 */
export function nextTableSort(current: TableSort | null, column: string, numeric: boolean): TableSort {
  if (current?.column === column) return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { column, direction: numeric ? 'desc' : 'asc' };
}

/**
 * Trie une copie, de façon stable.
 *
 * ⚠️ **Une valeur inconnue finit en bas dans les deux sens.** Inverser le tri
 * ne doit pas faire remonter les « non renseigné » en tête : on chercherait le
 * plus gros coût et on lirait une liste de trous.
 */
export function sortRows<T>(rows: readonly T[], key: (row: T) => SortKey, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const left = key(a);
    const right = key(b);
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    if (typeof left === 'number' && typeof right === 'number') return sign * (left - right);
    return sign * collator.compare(String(left), String(right));
  });
}

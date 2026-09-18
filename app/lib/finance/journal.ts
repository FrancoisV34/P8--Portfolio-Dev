/**
 * Le tri et la sélection du journal — la logique pure, hors React.
 *
 * Elle vit ici plutôt que dans le composant pour une raison simple : c'est la
 * partie qui peut mentir. Un tri sur des montants formatés place « 1 000,00 € »
 * avant « 9,00 € », et un tri sur des libellés accentués envoie « Édition »
 * après « Zoo » — deux défauts qu'on ne voit pas en relisant du JSX, mais qu'un
 * test attrape.
 */

export type JournalColumn = 'date' | 'label' | 'account' | 'category' | 'amount';
export type SortDirection = 'asc' | 'desc';
export type JournalSort = { column: JournalColumn; direction: SortDirection };

export type JournalRow = {
  id: string;
  date: string;
  label: string;
  account: string;
  category: string;
  amountCents: number;
};

/**
 * Les colonnes dont le premier clic trie du plus grand au plus petit.
 *
 * Sur une date comme sur un montant, ce qu'on cherche en triant c'est le plus
 * récent ou le plus gros — jamais le 1ᵉʳ janvier ni le plus petit centime.
 * Les colonnes de texte, elles, se lisent de A à Z.
 */
const DESCENDING_FIRST: ReadonlySet<JournalColumn> = new Set<JournalColumn>(['date', 'amount']);

/** Comparaison de texte en français : « Édition » se range à la lettre E. */
const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

/** Le tri qui suit un clic sur un en-tête : même colonne = on inverse. */
export function nextSort(current: JournalSort, column: JournalColumn): JournalSort {
  if (current.column === column) {
    return { column, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { column, direction: DESCENDING_FIRST.has(column) ? 'desc' : 'asc' };
}

function compare(a: JournalRow, b: JournalRow, column: JournalColumn): number {
  switch (column) {
    // Les dates sont en ISO (AAAA-MM-JJ) : l'ordre lexicographique EST l'ordre
    // chronologique, et le reste vrai au changement d'année.
    case 'date': return collator.compare(a.date, b.date);
    case 'label': return collator.compare(a.label, b.label);
    case 'account': return collator.compare(a.account, b.account);
    case 'category': return collator.compare(a.category, b.category);
    // ⚠️ Montants SIGNÉS, jamais en valeur absolue : une dépense de 500 € et
    // une recette de 500 € ne se rangent pas au même endroit. Le tri regroupe
    // les sorties d'un côté et les entrées de l'autre — c'est sa seule lecture
    // utile.
    case 'amount': return a.amountCents - b.amountCents;
  }
}

/**
 * Trie une copie — jamais le tableau d'origine.
 *
 * ⚠️ Deux garanties que le composant tient pour acquises. **Une copie** : les
 * lignes viennent de `useLoaderData`, les muter pendant un rendu corromprait le
 * cache du routeur. **La stabilité** : à valeur égale, l'ordre d'entrée est
 * conservé, donc deux mouvements du même jour restent dans l'ordre de saisie au
 * lieu de permuter d'un rendu à l'autre.
 */
export function sortJournal(rows: readonly JournalRow[], sort: JournalSort): JournalRow[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => sign * compare(a, b, sort.column));
}

/**
 * La ligne sélectionnée après une touche — bornée aux deux extrémités.
 *
 * ⚠️ On **borne**, on ne boucle pas. Dans un journal de 250 lignes, une flèche
 * bas qui repart en haut téléporte la sélection à l'autre bout sans que l'œil
 * suive : on croit corriger le dernier mouvement, on ouvre le premier.
 */
export function moveSelection(current: number | null, key: string, count: number): number | null {
  if (count === 0) return null;
  const last = count - 1;
  switch (key) {
    case 'ArrowDown': return current === null ? 0 : Math.min(current + 1, last);
    case 'ArrowUp': return current === null ? last : Math.max(current - 1, 0);
    case 'Home': return 0;
    case 'End': return last;
    default: return current;
  }
}

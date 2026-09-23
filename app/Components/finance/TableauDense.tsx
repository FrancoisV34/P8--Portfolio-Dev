import { Fragment, useState, type ReactNode } from 'react';
import { nextTableSort, sortRows, type SortKey, type TableSort } from '../../lib/finance/table';

export type Colonne<T> = {
  cle: string;
  libelle: string;
  /** Colonne de montants ou de nombres : alignée à droite, en chiffres tabulaires. */
  numerique?: boolean;
  valeur: (ligne: T) => ReactNode;
  /** Présente ⇒ colonne triable. La clé trie des centimes ou des dates ISO, jamais du texte formaté. */
  tri?: (ligne: T) => SortKey;
  /** Classe de cellule — la couleur de signe d'un montant, par exemple. */
  classe?: (ligne: T) => string;
};

/**
 * Le tableau dense de l'espace privé, pour les sections autres que le journal.
 *
 * Il reprend les motifs du journal — en-tête collant, tri par `<button>` dans
 * le `<th>`, ligne de total, correction dépliée sous la ligne — sans sa
 * sélection au clavier : les lignes n'ont pas d'action propre, seuls leurs
 * boutons en ont, et ils sont déjà atteignables par Tab.
 *
 * ⚠️ **Sous 680 px, des cartes, pas un défilement horizontal.** Le titre et le
 * montant restent visibles ; le reste des colonnes se déplie. Faire défiler le
 * tableau casserait la colonne de montants alignée à droite, c'est-à-dire la
 * comparaison verticale, au moment précis où elle sert le plus.
 *
 * ⚠️ **Le formulaire de correction est rendu deux fois** (tableau et cartes),
 * une seule des deux vues étant affichée. Il ne doit donc porter aucun `id`.
 */
export function TableauDense<T>({ legende, colonnes, lignes, cle, carte, total, detail, libelleDetail = 'Modifier' }: {
  legende: string;
  colonnes: Colonne<T>[];
  lignes: readonly T[];
  cle: (ligne: T) => string;
  carte: { titre: (ligne: T) => ReactNode; sousTitre?: (ligne: T) => ReactNode; montant?: (ligne: T) => ReactNode };
  /**
   * Ligne de total : un contenu par clé de colonne, le libellé occupe la
   * première. `carte` est le chiffre repris sous les cartes, sur mobile.
   */
  total?: { libelle: string; cellules: Record<string, ReactNode>; carte?: ReactNode };
  detail?: (ligne: T) => ReactNode;
  libelleDetail?: string;
}) {
  const [tri, setTri] = useState<TableSort | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const colonneTriee = tri ? colonnes.find((colonne) => colonne.cle === tri.column) : undefined;
  const ordonnees = tri && colonneTriee?.tri ? sortRows(lignes, colonneTriee.tri, tri.direction) : lignes;
  const largeur = colonnes.length + (detail ? 1 : 0);

  return <>
    <div className="finance-table-wrap" data-view="table">
      <div className="finance-table-scroll">
        <table className="finance-table">
          <caption>{legende}</caption>
          <thead>
            <tr>
              {colonnes.map((colonne) => {
                const actif = tri?.column === colonne.cle;
                const classe = colonne.numerique ? 'num' : undefined;
                if (!colonne.tri) return <th key={colonne.cle} scope="col" className={classe}>{colonne.libelle}</th>;
                return <th key={colonne.cle} scope="col" className={classe}
                  aria-sort={actif ? (tri!.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => setTri((actuel) => nextTableSort(actuel, colonne.cle, colonne.numerique ?? false))}>
                    {colonne.libelle}<span aria-hidden="true">{actif ? (tri!.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                  </button>
                </th>;
              })}
              {detail ? <th scope="col"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {ordonnees.map((ligne) => {
              const id = cle(ligne);
              return <Fragment key={id}>
                <tr>
                  {colonnes.map((colonne) => <td key={colonne.cle}
                    className={[colonne.numerique ? 'num' : '', colonne.classe?.(ligne) ?? ''].join(' ').trim() || undefined}>
                    {colonne.valeur(ligne)}
                  </td>)}
                  {detail ? <td className="num">
                    <button type="button" className="finance-button finance-button--quiet finance-button--mini"
                      aria-expanded={ouverte === id} onClick={() => setOuverte((actuelle) => (actuelle === id ? null : id))}>
                      {libelleDetail}
                    </button>
                  </td> : null}
                </tr>
                {detail && ouverte === id ? <tr className="finance-table__edition"><td colSpan={largeur}>{detail(ligne)}</td></tr> : null}
              </Fragment>;
            })}
          </tbody>
          {total ? <tfoot>
            <tr>
              {colonnes.map((colonne, index) => <td key={colonne.cle} className={colonne.numerique ? 'num' : undefined}>
                {index === 0 ? total.libelle : total.cellules[colonne.cle] ?? null}
              </td>)}
              {detail ? <td /> : null}
            </tr>
          </tfoot> : null}
        </table>
      </div>
    </div>

    <ul className="finance-cards" data-view="cards" aria-label={legende}>
      {ordonnees.map((ligne) => <li key={cle(ligne)}>
        <details>
          <summary>
            <span className="finance-cards__label">
              <strong>{carte.titre(ligne)}</strong>
              {carte.sousTitre ? <span>{carte.sousTitre(ligne)}</span> : null}
            </span>
            {carte.montant ? <span className="finance-cards__amount">{carte.montant(ligne)}</span> : null}
          </summary>
          <dl>
            {colonnes.map((colonne) => <Fragment key={colonne.cle}><dt>{colonne.libelle}</dt><dd>{colonne.valeur(ligne)}</dd></Fragment>)}
          </dl>
          {detail ? <details className="finance-cards__corriger">
            <summary>{libelleDetail}</summary>
            {detail(ligne)}
          </details> : null}
        </details>
      </li>)}
      {total?.carte ? <li className="finance-cards__total">
        <span>{total.libelle}</span><span className="finance-cards__amount">{total.carte}</span>
      </li> : null}
    </ul>
  </>;
}

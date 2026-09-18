/**
 * Le choix des étiquettes visibles sur un axe — la logique, hors du rendu.
 *
 * Elle existe **parce que** l'abscisse des courbes suit le temps réel. Dès que
 * deux relevés sont proches dans le temps, leurs libellés tombent presque au
 * même endroit et se superposent en un pâté illisible. Il faut donc en écarter
 * certains — et le faire dans le bon ordre.
 */

/**
 * Garde, parmi des positions ordonnées, celles qu'un écart minimal sépare.
 *
 * ⚠️ **Le parcours part de la FIN.** La dernière valeur est celle qu'on lit en
 * premier sur une courbe — un patrimoine actuel, un MRR du mois. La sacrifier
 * pour garder une étiquette du début serait exactement le mauvais arbitrage,
 * et c'est ce que ferait un parcours naïf de gauche à droite.
 *
 * Rien n'est perdu pour autant : l'équivalent textuel de la courbe liste tous
 * les relevés.
 *
 * @param positions abscisses, dans l'ordre croissant
 * @param minimum   écart en deçà duquel deux étiquettes se chevauchent
 * @returns les index de `positions` à afficher
 */
export function thinLabels(positions: readonly number[], minimum: number): Set<number> {
  const gardees: number[] = [];
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const derniere = gardees[gardees.length - 1];
    if (derniere === undefined || Math.abs(positions[derniere] - positions[index]) >= minimum) {
      gardees.push(index);
    }
  }
  return new Set(gardees);
}

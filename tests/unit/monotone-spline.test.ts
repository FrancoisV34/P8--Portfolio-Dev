import { describe, expect, it } from 'vitest';

import { canDrawTrend, monotonePath, type Point } from '../../app/lib/finance/monotone-spline';

/**
 * L'interpolation des courbes de l'espace privé — et la seule propriété qui
 * compte vraiment : **la courbe ne dépasse jamais ses points**.
 *
 * Ce n'est pas une préférence esthétique. Une Bézier cardinale ordinaire
 * dépasse ses points de contrôle : entre deux mois quasi plats suivis d'une
 * hausse, elle plonge SOUS la valeur la plus basse. Sur du patrimoine, la
 * courbe affirmerait alors une baisse qui n'a jamais eu lieu — le graphique
 * mentirait sur des données exactes.
 *
 * La vérification repose sur la **propriété de l'enveloppe convexe** d'une
 * Bézier cubique : la courbe reste entièrement dans l'enveloppe de ses quatre
 * points de contrôle. Il suffit donc de vérifier que les deux points de
 * contrôle intermédiaires restent dans l'intervalle des deux extrémités du
 * segment — pas besoin d'échantillonner la courbe.
 */

/** Extrait les segments cubiques d'un chemin SVG « M … C … C … ». */
function segments(chemin: string) {
  const nombres = chemin.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const [, y0, ...reste] = nombres;
  const sorties: { debut: number; c1: number; c2: number; fin: number }[] = [];
  let precedent = y0;
  // Après le M (2 valeurs), chaque C apporte 6 valeurs : x1 y1 x2 y2 x y.
  for (let i = 0; i + 5 < reste.length; i += 6) {
    const [, c1, , c2, , fin] = reste.slice(i, i + 6);
    sorties.push({ debut: precedent, c1, c2, fin });
    precedent = fin;
  }
  return sorties;
}

function pointsDepuis(valeurs: number[]): Point[] {
  return valeurs.map((y, i) => ({ x: i * 100, y }));
}

describe('interpolation monotone', () => {
  it('ne dépasse jamais l’intervalle de ses deux points voisins', () => {
    // Le cas exact cité par le handoff : deux mois quasi plats, puis une
    // hausse. C'est là qu'une cardinale plonge sous le point le plus bas.
    // (y croît vers le bas en SVG ; on raisonne sur des ordonnées brutes.)
    const valeurs = [120, 118, 117, 40, 38];
    const chemin = monotonePath(pointsDepuis(valeurs));

    for (const { debut, c1, c2, fin } of segments(chemin)) {
      const bas = Math.min(debut, fin);
      const haut = Math.max(debut, fin);
      expect(c1).toBeGreaterThanOrEqual(bas - 1e-9);
      expect(c1).toBeLessThanOrEqual(haut + 1e-9);
      expect(c2).toBeGreaterThanOrEqual(bas - 1e-9);
      expect(c2).toBeLessThanOrEqual(haut + 1e-9);
    }
  });

  it('reste plat quand les valeurs sont égales', () => {
    // Trois relevés identiques ne doivent pas produire d'ondulation : une
    // courbe qui bouge sur des valeurs constantes invente une variation.
    const chemin = monotonePath(pointsDepuis([50, 50, 50, 50]));
    for (const { debut, c1, c2, fin } of segments(chemin)) {
      expect(c1).toBeCloseTo(50, 9);
      expect(c2).toBeCloseTo(50, 9);
      expect(debut).toBeCloseTo(50, 9);
      expect(fin).toBeCloseTo(50, 9);
    }
  });

  it('respecte le sens de variation sur une série croissante', () => {
    const valeurs = [10, 30, 31, 80];
    for (const { debut, c1, c2, fin } of segments(monotonePath(pointsDepuis(valeurs)))) {
      // Monotone croissant : chaque point de contrôle reste entre les bornes,
      // donc la courbe ne redescend jamais entre deux relevés qui montent.
      expect(c1).toBeGreaterThanOrEqual(Math.min(debut, fin) - 1e-9);
      expect(c2).toBeLessThanOrEqual(Math.max(debut, fin) + 1e-9);
    }
  });

  it('exige trois points avant de tracer une tendance', () => {
    // Une ligne entre deux points est une extrapolation graphique : elle donne
    // à voir une tendance que deux mesures ne suffisent pas à établir.
    expect(canDrawTrend(0)).toBe(false);
    expect(canDrawTrend(1)).toBe(false);
    expect(canDrawTrend(2)).toBe(false);
    expect(canDrawTrend(3)).toBe(true);
  });
});

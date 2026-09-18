import { describe, expect, it } from 'vitest';

import { thinLabels } from '../../app/lib/finance/chart-labels';

describe('espacement des étiquettes d’axe', () => {
  it('garde toujours la dernière, jamais la première à sa place', () => {
    // ⚠️ La propriété qui compte. Sur une courbe, la dernière valeur est celle
    // qu'on lit en premier : un patrimoine actuel, un MRR du mois. Un parcours
    // naïf de gauche à droite garderait la position 0 et jetterait la 10 —
    // exactement le mauvais arbitrage.
    const gardees = thinLabels([0, 10], 50);
    expect(gardees.has(1)).toBe(true);
    expect(gardees.has(0)).toBe(false);
  });

  it('n’en laisse jamais deux plus proches que l’écart', () => {
    // Le cas réel : quatre relevés en mars, puis un en septembre.
    const positions = [0, 8, 16, 24, 300];
    const gardees = [...thinLabels(positions, 50)].sort((a, b) => a - b);
    for (let i = 1; i < gardees.length; i += 1) {
      expect(positions[gardees[i]] - positions[gardees[i - 1]]).toBeGreaterThanOrEqual(50);
    }
    expect(gardees.length).toBeGreaterThanOrEqual(2);
  });

  it('garde tout quand rien ne se chevauche', () => {
    expect(thinLabels([0, 100, 200, 300], 50).size).toBe(4);
  });

  it('ne garde qu’une étiquette quand tout est empilé au même endroit', () => {
    expect(thinLabels([10, 10, 10, 10], 50)).toEqual(new Set([3]));
  });

  it('ne renvoie rien pour une série vide', () => {
    expect(thinLabels([], 50).size).toBe(0);
  });
});

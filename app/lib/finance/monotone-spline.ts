// Interpolation monotone Fritsch–Carlson — espace privé (CFO)
// Aucune dépendance. Garantie : la courbe reste dans l'intervalle de ses
// deux points voisins. Une Bézier cardinale ordinaire ne le garantit PAS
// et peut plonger sous une valeur qui n'a jamais baissé.
//
// Si tu passes par Recharts : <Line type="monotone" /> applique le même
// principe. N'utilise JAMAIS type="natural" ni type="basis" sur du
// patrimoine ou du budget.

export type Point = { x: number; y: number };

/** Tangentes monotones (Fritsch–Carlson 1980). */
function monotoneTangents(xs: number[], ys: number[]) {
  const n = xs.length;
  const dx: number[] = [];
  const m: number[] = [];
  const t: number[] = [];

  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = xs[i + 1] - xs[i];
    m[i] = (ys[i + 1] - ys[i]) / dx[i];
  }

  t[0] = m[0];
  for (let i = 1; i < n - 1; i += 1) {
    // Extremum local → tangente nulle : c'est ce qui empêche le dépassement.
    if (m[i - 1] * m[i] <= 0) {
      t[i] = 0;
      continue;
    }
    const w1 = 2 * dx[i] + dx[i - 1];
    const w2 = dx[i] + 2 * dx[i - 1];
    t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]);
  }
  t[n - 1] = m[n - 2];

  return { dx, t };
}

/**
 * Chemin SVG (`d`) monotone passant exactement par chaque point.
 * Renvoie '' pour moins de deux points.
 */
export function monotonePath(points: Point[]): string {
  if (points.length < 2) return '';
  // ⚠️ Abscisses STRICTEMENT croissantes, sinon `dx` vaut zéro ou passe au
  // négatif : les tangentes deviennent Infinity ou NaN, et le `d` produit est
  // un chemin que le navigateur ignore EN SILENCE — pas d'erreur, pas de
  // courbe, rien à déboguer. On refuse plutôt que de rendre l'invisible, et
  // l'appelant retombe sur son équivalent textuel.
  for (let i = 1; i < points.length; i += 1) if (points[i].x <= points[i - 1].x) return '';

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const { dx, t } = monotoneTangents(xs, ys);

  let d = `M${xs[0].toFixed(2)},${ys[0].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const h = dx[i] / 3;
    d +=
      `C${(xs[i] + h).toFixed(2)},${(ys[i] + t[i] * h).toFixed(2)}` +
      ` ${(xs[i + 1] - h).toFixed(2)},${(ys[i + 1] - t[i + 1] * h).toFixed(2)}` +
      ` ${xs[i + 1].toFixed(2)},${ys[i + 1].toFixed(2)}`;
  }
  return d;
}

/** Aire sous la courbe, fermée sur la ligne de base. */
export function monotoneArea(points: Point[], baselineY: number): string {
  const path = monotonePath(points);
  if (!path) return '';
  const last = points[points.length - 1];
  const first = points[0];
  return `${path} L${last.x.toFixed(2)},${baselineY} L${first.x.toFixed(2)},${baselineY} Z`;
}

/**
 * Bande d'un empilement : entre une frontière haute et une frontière basse,
 * avec un interstice de fond (2 px par défaut) sous la bande.
 */
export function monotoneBand(
  upper: Point[],
  lower: Point[],
  gap = 2,
): string {
  const up = monotonePath(upper);
  const down = monotonePath(
    lower.map((p) => ({ x: p.x, y: p.y + gap })).reverse(),
  );
  if (!up || !down) return '';
  return `${up} L${down.slice(1)} Z`;
}

/**
 * Le seuil des trois points. Sous ce seuil, NE DESSINE PAS de courbe :
 * affiche la dernière valeur et l'écart avec la précédente. Une ligne
 * entre deux points suggère une tendance qui n'existe pas.
 */
export function canDrawTrend(seriesLength: number): boolean {
  return seriesLength >= 3;
}

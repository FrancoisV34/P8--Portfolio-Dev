import { canDrawTrend, monotonePath, type Point } from '../../lib/finance/monotone-spline';

/**
 * Courbe de trajectoire — le patron réutilisable de l'espace privé.
 *
 * ⚠️ **Trois points minimum, et ce n'est pas une préférence esthétique.** Une
 * ligne tracée entre deux points est une extrapolation graphique : elle donne à
 * voir une tendance que deux mesures ne suffisent pas à établir. Sous le seuil,
 * on affiche le chiffre et l'écart — c'est tout ce qu'on sait.
 *
 * ⚠️ **Interpolation MONOTONE** (Fritsch–Carlson), jamais une cardinale
 * ordinaire. Une Bézier classique dépasse ses points de contrôle : entre deux
 * mois quasi plats suivis d'une hausse, elle plonge **sous** la valeur la plus
 * basse. Sur du patrimoine, la courbe affirmerait une baisse qui n'a jamais eu
 * lieu. Si l'on passe un jour à Recharts : `type="monotone"`, jamais `natural`
 * ni `basis`.
 *
 * Un seul axe des ordonnées — deux grandeurs d'échelles différentes donnent
 * deux graphiques, jamais un double axe.
 */

type Serie = { label: string; cents: number };

const VUE = { w: 640, h: 200, padX: 44, padY: 18 };

function formatCourt(cents: number) {
  const euros = cents / 100;
  if (Math.abs(euros) >= 1000) return `${Math.round(euros / 1000)} k€`;
  return `${Math.round(euros)} €`;
}

export function Trend({ series, legende }: { series: Serie[]; legende?: string }) {
  // Sous trois points : le chiffre et l'écart, pas une courbe.
  if (!canDrawTrend(series.length)) {
    const dernier = series.at(-1);
    const avant = series.at(-2);
    if (!dernier) return null;
    const ecart = avant ? dernier.cents - avant.cents : null;
    return <figure className="finance-chart">
      <figcaption>
        {legende ?? 'Trajectoire'} — {series.length === 1 ? 'un seul relevé' : 'deux relevés'}.
        Il en faut trois pour tracer une tendance.
      </figcaption>
      <p className="finance-chart__solo tnum">{formatCourt(dernier.cents)}</p>
      {ecart !== null ? <p className="finance-chart__delta tnum">
        {ecart >= 0 ? '+' : '−'}{formatCourt(Math.abs(ecart))} depuis {avant?.label}
      </p> : null}
    </figure>;
  }

  const valeurs = series.map((s) => s.cents);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  // Une amplitude nulle (trois mois identiques) diviserait par zéro : on
  // retombe sur une ligne médiane plutôt que sur un NaN silencieux.
  const amplitude = max - min || 1;

  const points: Point[] = series.map((s, i) => ({
    x: VUE.padX + (i * (VUE.w - VUE.padX * 2)) / (series.length - 1),
    y: VUE.padY + (1 - (s.cents - min) / amplitude) * (VUE.h - VUE.padY * 2),
  }));

  // Étiquettes : premier, dernier, extrêmes. Quatre au maximum — une valeur
  // sur chaque point rend le graphique illisible et ne sert personne.
  const iMin = valeurs.indexOf(min);
  const iMax = valeurs.indexOf(max);
  const marques = new Set([0, series.length - 1, iMin, iMax]);

  return <figure className="finance-chart">
    {legende ? <figcaption>{legende}</figcaption> : null}
    <svg viewBox={`0 0 ${VUE.w} ${VUE.h}`} role="img"
      aria-label={`${legende ?? 'Trajectoire'} : ${series.map((s) => `${s.label} ${formatCourt(s.cents)}`).join(', ')}`}>
      <line className="finance-chart__grid" x1={VUE.padX} y1={VUE.h - VUE.padY} x2={VUE.w - VUE.padX} y2={VUE.h - VUE.padY} />
      <path className="finance-chart__line" d={monotonePath(points)} />
      {points.map((point, i) => (marques.has(i) ? (
        <circle key={series[i].label} className="finance-chart__dot" cx={point.x} cy={point.y} r={5} />
      ) : null))}
      {points.map((point, i) => (marques.has(i) ? (
        <text
          key={`v-${series[i].label}`}
          className={`finance-chart__label ${i === series.length - 1 ? 'finance-chart__label--last' : ''}`}
          x={point.x}
          y={point.y - 12}
          textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
        >{formatCourt(series[i].cents)}</text>
      ) : null))}
      {points.map((point, i) => (
        <text
          key={`x-${series[i].label}`}
          className={`finance-chart__label ${i === series.length - 1 ? 'finance-chart__label--last' : ''}`}
          x={point.x}
          y={VUE.h - 2}
          textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'}
        >{series[i].label}</text>
      ))}
    </svg>
    {/* Une donnée chiffrée doit rester atteignable sans lire un graphique :
        le tableau est l'équivalent textuel, pas un doublon. */}
    <details>
      <summary>Voir les valeurs</summary>
      <ul className="finance-list">
        {series.map((s) => <li key={s.label}><span>{s.label}</span><span>{formatCourt(s.cents)}</span></li>)}
      </ul>
    </details>
  </figure>;
}

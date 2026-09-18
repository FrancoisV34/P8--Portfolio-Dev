import { thinLabels } from '../../lib/finance/chart-labels';
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
 * ⚠️ **L'abscisse suit le temps réel dès que `at` est fourni.** Des relevés du
 * 15 janvier, du 3 février puis du 1er septembre ne sont pas équidistants : les
 * espacer également ferait ressembler un trou de 210 jours à un trou de 19, et
 * la pente affichée ne serait plus la vraie pente. `at` est un numéro de jour
 * (`dayNumber`) ou un indice de mois — n'importe quelle unité, pourvu qu'elle
 * soit linéaire dans le temps.
 *
 * Un seul axe des ordonnées — deux grandeurs d'échelles différentes donnent
 * deux graphiques, jamais un double axe.
 */

type Serie = { label: string; cents: number; at?: number };

// ⚠️ `padY` doit loger l'ÉTIQUETTE du point extrême, pas seulement le point :
// elle est tracée 12 unités au-dessus, et son jambage monte encore. À 18, le
// montant le plus haut était rogné par le haut du `viewBox`.
const VUE = { w: 640, h: 200, padX: 44, padY: 34 };
/** Au-delà, une étiquette par point devient un pâté illisible. */
const MAX_ETIQUETTES_X = 6;
/** Largeurs minimales entre deux étiquettes, en unités de `viewBox`. */
const ECART_DATE = 86;
const ECART_VALEUR = 72;

/**
 * Le montant abrégé d'une étiquette.
 *
 * ⚠️ Une décimale en dessous de 10 k€, et ce n'est pas cosmétique : arrondir
 * 2 610 € au millier donne « 3 k€ », soit **15 % de plus que la réalité**, sur
 * un graphique dont tout l'intérêt est de montrer une grandeur. Au-delà de
 * 10 k€, l'arrondi au millier coûte moins de 5 % et la lecture y gagne.
 */
function formatCourt(cents: number) {
  const euros = cents / 100;
  const absolu = Math.abs(euros);
  if (absolu >= 10_000) return `${Math.round(euros / 1000)} k€`;
  if (absolu >= 1_000) return `${(euros / 1000).toFixed(1).replace('.', ',')} k€`;
  return `${Math.round(euros)} €`;
}

/** Le repli : le chiffre et l'écart, jamais une courbe qu'on ne sait pas tracer. */
function Repli({ series, legende, raison, note }: { series: Serie[]; legende?: string; raison: string; note?: string }) {
  const dernier = series.at(-1);
  const avant = series.at(-2);
  if (!dernier) return null;
  const ecart = avant ? dernier.cents - avant.cents : null;
  return <figure className="finance-chart">
    <figcaption>{legende ?? 'Trajectoire'} — {raison}</figcaption>
    <p className="finance-chart__solo tnum">{formatCourt(dernier.cents)}</p>
    {ecart !== null ? <p className="finance-chart__delta tnum">
      {ecart >= 0 ? '+' : '−'}{formatCourt(Math.abs(ecart))} depuis {avant?.label}
    </p> : null}
    {note ? <p className="finance-chart__note">{note}</p> : null}
  </figure>;
}

export function Trend({ series, legende, note }: { series: Serie[]; legende?: string; note?: string }) {
  if (!canDrawTrend(series.length)) {
    return <Repli
      series={series}
      legende={legende}
      note={note}
      raison={`${series.length === 1 ? 'un seul relevé' : 'deux relevés'}. Il en faut trois pour tracer une tendance.`}
    />;
  }

  // Les valorisations arrivent de la base en ordre DÉCROISSANT : les tracer
  // telles quelles dessinerait la courbe à rebours du temps.
  const date = series.every((point) => typeof point.at === 'number');
  const ordonnee = date ? [...series].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)) : series;

  const valeurs = ordonnee.map((point) => point.cents);
  const min = Math.min(...valeurs);
  const max = Math.max(...valeurs);
  // Une amplitude nulle (trois relevés identiques) diviserait par zéro : on
  // retombe sur une ligne médiane plutôt que sur un NaN silencieux.
  const amplitude = max - min || 1;

  const abscisses = date ? ordonnee.map((point) => point.at as number) : ordonnee.map((_, index) => index);
  const debut = abscisses[0];
  const etendue = abscisses[abscisses.length - 1] - debut || 1;

  const points: Point[] = ordonnee.map((point, index) => ({
    x: VUE.padX + ((abscisses[index] - debut) / etendue) * (VUE.w - VUE.padX * 2),
    y: VUE.padY + (1 - (point.cents - min) / amplitude) * (VUE.h - VUE.padY * 2),
  }));

  const chemin = monotonePath(points);
  // `monotonePath` refuse les abscisses non strictement croissantes — deux
  // relevés le même jour, ou une série restée dans le désordre. Plutôt qu'une
  // courbe absente sans explication, on retombe sur l'équivalent textuel.
  if (!chemin) {
    return <Repli series={ordonnee} legende={legende} note={note} raison="relevés non ordonnables dans le temps" />;
  }

  // Étiquettes : premier, dernier, extrêmes. Quatre au maximum — une valeur
  // sur chaque point rend le graphique illisible et ne sert personne.
  const iMin = valeurs.indexOf(min);
  const iMax = valeurs.indexOf(max);
  const marques = new Set([0, ordonnee.length - 1, iMin, iMax]);
  const triees = [...marques].sort((a, b) => a - b);
  const abscissesTracees = points.map((point) => point.x);
  const valeursVisibles = thinLabels(triees.map((i) => abscissesTracees[i]), ECART_VALEUR);
  // ⚠️ Sur 120 mois, une étiquette d'abscisse par point donne un trait noir
  // continu. Au-delà de six relevés, seuls les points marqués sont datés.
  const candidates = ordonnee.length <= MAX_ETIQUETTES_X ? ordonnee.map((_, index) => index) : triees;
  const datees = thinLabels(candidates.map((i) => abscissesTracees[i]), ECART_DATE);

  const resume = [
    `${ordonnee[0].label} ${formatCourt(ordonnee[0].cents)}`,
    `plus bas ${ordonnee[iMin].label} ${formatCourt(min)}`,
    `plus haut ${ordonnee[iMax].label} ${formatCourt(max)}`,
    `${ordonnee[ordonnee.length - 1].label} ${formatCourt(ordonnee[ordonnee.length - 1].cents)}`,
  ].join(', ');

  return <figure className="finance-chart">
    {legende ? <figcaption>{legende}</figcaption> : null}
    <svg viewBox={`0 0 ${VUE.w} ${VUE.h}`} role="img"
      aria-label={`${legende ?? 'Trajectoire'} sur ${ordonnee.length} relevés : ${resume}. Le détail chiffré suit sous « Voir les valeurs ».`}>
      <line className="finance-chart__grid" x1={VUE.padX} y1={VUE.h - VUE.padY} x2={VUE.w - VUE.padX} y2={VUE.h - VUE.padY} />
      <path className="finance-chart__line" d={chemin} />
      {points.map((point, index) => (marques.has(index) ? (
        <circle key={ordonnee[index].label} className="finance-chart__dot" cx={point.x} cy={point.y} r={5} />
      ) : null))}
      {points.map((point, index) => (valeursVisibles.has(triees.indexOf(index)) ? (
        <text
          key={`v-${ordonnee[index].label}`}
          className={`finance-chart__label ${index === ordonnee.length - 1 ? 'finance-chart__label--last' : ''}`}
          x={point.x}
          y={point.y - 12}
          textAnchor={index === 0 ? 'start' : index === ordonnee.length - 1 ? 'end' : 'middle'}
        >{formatCourt(ordonnee[index].cents)}</text>
      ) : null))}
      {points.map((point, index) => (datees.has(candidates.indexOf(index)) ? (
        <text
          key={`x-${ordonnee[index].label}`}
          className={`finance-chart__label ${index === ordonnee.length - 1 ? 'finance-chart__label--last' : ''}`}
          x={point.x}
          y={VUE.h - 2}
          textAnchor={index === 0 ? 'start' : index === ordonnee.length - 1 ? 'end' : 'middle'}
        >{ordonnee[index].label}</text>
      ) : null))}
    </svg>
    {note ? <p className="finance-chart__note">{note}</p> : null}
    {/* Une donnée chiffrée doit rester atteignable sans lire un graphique :
        le tableau est l'équivalent textuel, pas un doublon. */}
    <details>
      <summary>Voir les valeurs</summary>
      <ul className="finance-list">
        {ordonnee.map((point) => <li key={point.label}><span>{point.label}</span><span>{formatCourt(point.cents)}</span></li>)}
      </ul>
    </details>
  </figure>;
}

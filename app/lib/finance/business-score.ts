export type BusinessScoreComponent = {
  key: 'operating-margin' | 'mrr-trend';
  label: string;
  observedBasisPoints: number;
  scoreBasisPoints: number;
};

export type ObservedBusinessScore = {
  scoreBasisPoints: number | null;
  coverageBasisPoints: number;
  components: BusinessScoreComponent[];
};

export type ObservedBusinessScoreInput = {
  revenueCents: number;
  operatingExpenseCents: number;
  mrrHistoryCents: readonly (number | null)[];
};

const scoreWeightBasisPoints = 5_000;
const mrrTrendFloorBasisPoints = -2_000;
const mrrTrendCeilingBasisPoints = 2_000;
const marginCeilingBasisPoints = 5_000;

function roundedBasisPoints(numerator: number, denominator: number) {
  const numeratorValue = BigInt(numerator);
  const denominatorValue = BigInt(denominator);
  const absolute = numeratorValue < 0n ? -numeratorValue : numeratorValue;
  const rounded = (absolute * 10_000n + denominatorValue / 2n) / denominatorValue;
  return Number(numeratorValue < 0n ? -rounded : rounded);
}

function normalizedScore(value: number, minimum: number, maximum: number) {
  const bounded = Math.min(maximum, Math.max(minimum, value));
  return Math.round((bounded - minimum) * 10_000 / (maximum - minimum));
}

/**
 * Indice exploratoire : il normalise uniquement les observations disponibles.
 * Une absence de donnée réduit la couverture, jamais le score lui-même.
 */
export function observedBusinessScore(input: ObservedBusinessScoreInput): ObservedBusinessScore {
  const components: BusinessScoreComponent[] = [];
  if (input.revenueCents > 0) {
    const marginBasisPoints = input.operatingExpenseCents >= input.revenueCents
      ? 0
      : roundedBasisPoints(input.revenueCents - input.operatingExpenseCents, input.revenueCents);
    components.push({
      key: 'operating-margin', label: 'Marge opérationnelle du mois', observedBasisPoints: marginBasisPoints,
      scoreBasisPoints: normalizedScore(marginBasisPoints, 0, marginCeilingBasisPoints),
    });
  }

  const recentMrr = input.mrrHistoryCents.slice(-4);
  if (recentMrr.length === 4 && recentMrr.every((value): value is number => value !== null) && recentMrr[0]! > 0) {
    const firstMrr = recentMrr[0]!;
    const trendBasisPoints = roundedBasisPoints(recentMrr[3]! - firstMrr, firstMrr);
    components.push({
      key: 'mrr-trend', label: 'Évolution du MRR sur trois mois', observedBasisPoints: trendBasisPoints,
      scoreBasisPoints: normalizedScore(trendBasisPoints, mrrTrendFloorBasisPoints, mrrTrendCeilingBasisPoints),
    });
  }

  const coverageBasisPoints = components.length * scoreWeightBasisPoints;
  return {
    scoreBasisPoints: components.length === 0
      ? null
      : Math.round(components.reduce((total, component) => total + component.scoreBasisPoints, 0) / components.length),
    coverageBasisPoints,
    components,
  };
}

const SATOSHIS_PER_BITCOIN = 100_000_000n;
const MILLI_TH_PER_TH = 1_000n;

export type AccumulatedBtcPolicy = 'keep' | 'reinvest-at-threshold';

export type ContributionPhase = {
  startMonth: number;
  endMonth: number | null;
  amountCents: number;
};

export type MonthlyGoMiningScenario = {
  horizonMonths: number;
  initialHashrateMilliTh: number;
  initialAccumulatedSats: number;
  thresholdHashrateMilliTh: number;
  monthlyNetRewardSatsPerTh: number;
  priceMilliCentsPerMilliTh: number;
  btcPriceCents: number;
  contributionPhases: readonly ContributionPhase[];
  accumulatedBtcPolicy: AccumulatedBtcPolicy;
};

export type MonthlyGoMiningResult = {
  month: number;
  contributionCents: number;
  rewardSats: number;
  startHashrateMilliTh: number;
  endHashrateMilliTh: number;
  contributionHashrateMilliTh: number;
  reinvestedHashrateMilliTh: number;
  accumulatedBtcSats: number;
  reinvestedBtcSats: number;
  thresholdReachedAtEnd: boolean;
};

export type GoMiningProjection = {
  months: MonthlyGoMiningResult[];
  thresholdReachedMonth: number | null;
  totalContributionCents: number;
  totalRewardSats: number;
  retainedBtcSats: number;
  reinvestedBtcSats: number;
  finalHashrateMilliTh: number;
  contributionHashrateMilliTh: number;
  reinvestedHashrateMilliTh: number;
};

function assertSafeNonNegative(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} invalide.`);
}
function assertSafePositive(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} invalide.`);
}
function safe(value: bigint, label: string) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${label} hors limite.`);
  return Number(value);
}
function ceilDivide(numerator: bigint, denominator: bigint) {
  return (numerator + denominator - 1n) / denominator;
}

/**
 * Projection mensuelle déterministe. La récompense utilise la puissance au
 * début du mois ; apports et réinvestissements prennent effet à sa fin.
 * `monthlyNetRewardSatsPerTh` est une hypothèse nette datée, pas une promesse
 * de rendement ni un calcul de frais GoMining.
 */
export function projectMonthlyGoMining(input: MonthlyGoMiningScenario): GoMiningProjection {
  assertSafePositive(input.horizonMonths, 'Horizon');
  assertSafePositive(input.initialHashrateMilliTh, 'Puissance initiale');
  assertSafeNonNegative(input.initialAccumulatedSats, 'BTC initial');
  assertSafePositive(input.thresholdHashrateMilliTh, 'Seuil');
  assertSafeNonNegative(input.monthlyNetRewardSatsPerTh, 'Récompense nette');
  assertSafePositive(input.priceMilliCentsPerMilliTh, 'Prix de puissance');
  assertSafePositive(input.btcPriceCents, 'Cours BTC');
  if (input.accumulatedBtcPolicy !== 'keep' && input.accumulatedBtcPolicy !== 'reinvest-at-threshold') throw new Error('Politique BTC invalide.');
  for (const phase of input.contributionPhases) {
    assertSafePositive(phase.startMonth, 'Début de palier');
    if (phase.endMonth !== null && (!Number.isSafeInteger(phase.endMonth) || phase.endMonth < phase.startMonth)) throw new Error('Fin de palier invalide.');
    assertSafeNonNegative(phase.amountCents, 'Apport mensuel');
  }

  const threshold = BigInt(input.thresholdHashrateMilliTh);
  const rewardPerTh = BigInt(input.monthlyNetRewardSatsPerTh);
  const pricePerMilliTh = BigInt(input.priceMilliCentsPerMilliTh);
  const btcPriceCents = BigInt(input.btcPriceCents);
  let totalHashrate = BigInt(input.initialHashrateMilliTh);
  let contributionHashrate = 0n;
  let reinvestedHashrate = 0n;
  let retainedBtc = BigInt(input.initialAccumulatedSats);
  let reinvestedBtc = 0n;
  let totalReward = 0n;
  let totalContribution = 0n;
  let thresholdReachedMonth: number | null = totalHashrate >= threshold ? 0 : null;
  const months: MonthlyGoMiningResult[] = [];

  for (let month = 1; month <= input.horizonMonths; month += 1) {
    const startHashrate = totalHashrate;
    const reward = (startHashrate * rewardPerTh) / MILLI_TH_PER_TH;
    totalReward += reward;
    const contribution = input.contributionPhases.find((phase) => month >= phase.startMonth && (phase.endMonth === null || month <= phase.endMonth))?.amountCents ?? 0;
    const contributionCents = BigInt(contribution);
    totalContribution += contributionCents;
    const boughtWithContribution = (contributionCents * 1_000n) / pricePerMilliTh;
    contributionHashrate += boughtWithContribution;
    totalHashrate += boughtWithContribution;

    let spentSats = 0n;
    let boughtWithReinvestment = 0n;
    if (startHashrate >= threshold) {
      // Après le seuil, seules les nouvelles récompenses sont réinvesties.
      const rewardValueMilliCents = (reward * btcPriceCents * 1_000n) / SATOSHIS_PER_BITCOIN;
      boughtWithReinvestment = rewardValueMilliCents / pricePerMilliTh;
      spentSats = ceilDivide(boughtWithReinvestment * pricePerMilliTh * SATOSHIS_PER_BITCOIN, btcPriceCents * 1_000n);
    } else {
      retainedBtc += reward;
      if (totalHashrate >= threshold && input.accumulatedBtcPolicy === 'reinvest-at-threshold') {
        const retainedValueMilliCents = (retainedBtc * btcPriceCents * 1_000n) / SATOSHIS_PER_BITCOIN;
        boughtWithReinvestment = retainedValueMilliCents / pricePerMilliTh;
        spentSats = ceilDivide(boughtWithReinvestment * pricePerMilliTh * SATOSHIS_PER_BITCOIN, btcPriceCents * 1_000n);
        if (spentSats > retainedBtc) throw new Error('Réinvestissement supérieur au stock BTC.');
        retainedBtc -= spentSats;
      }
    }
    if (spentSats > reward && startHashrate >= threshold) throw new Error('Réinvestissement supérieur à la récompense.');
    reinvestedBtc += spentSats;
    reinvestedHashrate += boughtWithReinvestment;
    totalHashrate += boughtWithReinvestment;
    if (thresholdReachedMonth === null && totalHashrate >= threshold) thresholdReachedMonth = month;
    months.push({
      month, contributionCents: safe(contributionCents, 'Apport'), rewardSats: safe(reward, 'Récompense'),
      startHashrateMilliTh: safe(startHashrate, 'Puissance'), endHashrateMilliTh: safe(totalHashrate, 'Puissance'),
      contributionHashrateMilliTh: safe(contributionHashrate, 'Puissance'), reinvestedHashrateMilliTh: safe(reinvestedHashrate, 'Puissance'),
      accumulatedBtcSats: safe(retainedBtc, 'BTC conservés'), reinvestedBtcSats: safe(reinvestedBtc, 'BTC réinvestis'),
      thresholdReachedAtEnd: totalHashrate >= threshold,
    });
  }
  return {
    months, thresholdReachedMonth, totalContributionCents: safe(totalContribution, 'Apports'), totalRewardSats: safe(totalReward, 'Récompenses'),
    retainedBtcSats: safe(retainedBtc, 'BTC conservés'), reinvestedBtcSats: safe(reinvestedBtc, 'BTC réinvestis'),
    finalHashrateMilliTh: safe(totalHashrate, 'Puissance'), contributionHashrateMilliTh: safe(contributionHashrate, 'Puissance'), reinvestedHashrateMilliTh: safe(reinvestedHashrate, 'Puissance'),
  };
}

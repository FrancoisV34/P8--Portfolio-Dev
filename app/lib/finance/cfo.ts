import { euroCents, sumEuroCents, type EuroCents } from './units.ts';

export const cfoRuleVersion = 'cfo-v1' as const;
const speculativeLimitBasisPoints = 500;
export const cfoBuckets = ['placements', 'business', 'material', 'projects', 'opportunities'] as const;
export type CfoBucket = typeof cfoBuckets[number];
export type CfoWeights = Record<CfoBucket, number>;
export const initialCfoWeights: CfoWeights = { placements: 3_500, business: 2_500, material: 1_500, projects: 1_000, opportunities: 1_500 };
export type CfoRuleSet = { version: string; weights: CfoWeights };
export const defaultCfoRuleSet: CfoRuleSet = { version: cfoRuleVersion, weights: initialCfoWeights };

export type CfoInput = {
  period: string;
  liquidCashCents: number;
  reserveTargetCents: number | null;
  reserveCurrentCents: number;
  unpaidCommitmentCents: number;
  debtPaymentCents: number;
  businessProvisionCents: number;
  gominingContributionCents: number;
  speculativeAssetCents: number;
  grossAssetCents: number;
  businessCashComplete: boolean;
  activeProjectCount: number;
  projectCapacityStatus: 'compatible' | 'watch' | 'unknown';
};

export type CfoAllocation = { bucket: CfoBucket; amountCents: EuroCents; weightBasisPoints: number };
export type CfoResult = {
  ruleVersion: string;
  liquidCashCents: EuroCents;
  obligationCents: EuroCents;
  reserveShortfallCents: EuroCents;
  allocableCashCents: EuroCents;
  speculativeShareBasisPoints: number | null;
  priority: 'obligations' | 'reserve' | 'speculative-limit' | 'missing-data' | 'no-cash' | 'allocation';
  title: string;
  explanation: string;
  warnings: string[];
  allocation: CfoAllocation[] | null;
};

function positive(value: number) { return euroCents(Math.max(0, value)); }

function allocate(total: EuroCents, weights: CfoWeights): CfoAllocation[] {
  const weighted = cfoBuckets.map((bucket) => ({ bucket, weightBasisPoints: weights[bucket] }));
  const preliminary = weighted.map((item) => ({ ...item, amountCents: euroCents(Math.floor(total * item.weightBasisPoints / 10_000)) }));
  const assigned = sumEuroCents(preliminary.map((item) => item.amountCents));
  const last = preliminary.at(-1)!;
  last.amountCents = euroCents(last.amountCents + total - assigned);
  return preliminary;
}

/** Moteur déterministe, sans ordre ni mutation des données source. */
export function evaluateCfo(raw: CfoInput, ruleSet: CfoRuleSet = defaultCfoRuleSet): CfoResult {
  const input = {
    ...raw,
    liquidCashCents: positive(raw.liquidCashCents), reserveCurrentCents: positive(raw.reserveCurrentCents),
    unpaidCommitmentCents: positive(raw.unpaidCommitmentCents), debtPaymentCents: positive(raw.debtPaymentCents),
    businessProvisionCents: positive(raw.businessProvisionCents), gominingContributionCents: positive(raw.gominingContributionCents), speculativeAssetCents: positive(raw.speculativeAssetCents), grossAssetCents: positive(raw.grossAssetCents),
    reserveTargetCents: raw.reserveTargetCents === null ? null : positive(raw.reserveTargetCents),
  };
  const obligationCents = sumEuroCents([input.unpaidCommitmentCents, input.debtPaymentCents, input.businessProvisionCents, input.gominingContributionCents]);
  const reserveShortfallCents = input.reserveTargetCents === null ? euroCents(0) : positive(input.reserveTargetCents - input.reserveCurrentCents);
  const allocableCashCents = positive(input.liquidCashCents - obligationCents - reserveShortfallCents);
  const speculativeShareBasisPoints = input.grossAssetCents === 0 ? null : Math.round(input.speculativeAssetCents * 10_000 / input.grossAssetCents);
  const missing: string[] = [];
  if (input.reserveTargetCents === null) missing.push('La cible de réserve de sécurité n’est pas configurée.');
  if (!input.businessCashComplete) missing.push('Le cash de chaque entité business n’est pas entièrement renseigné.');
  if (input.activeProjectCount > 0 && input.projectCapacityStatus === 'unknown') missing.push('La capacité des projets actifs n’est pas entièrement renseignée.');
  if (input.activeProjectCount > 0 && input.projectCapacityStatus === 'watch') missing.push('La charge des projets actifs dépasse la capacité déclarée.');
  const warnings = [...missing];
  if (speculativeShareBasisPoints !== null && speculativeShareBasisPoints > speculativeLimitBasisPoints) warnings.push('La part spéculative observée dépasse le plafond initial de 5 %.');

  const common = { ruleVersion: ruleSet.version, liquidCashCents: input.liquidCashCents, obligationCents, reserveShortfallCents, allocableCashCents, speculativeShareBasisPoints, warnings };
  if (obligationCents > 0) return { ...common, priority: 'obligations', title: 'Préserver les obligations connues', explanation: 'Les engagements non réglés, mensualités de dettes, provisions déclarées et apports GoMining budgétés sont réservés avant toute nouvelle allocation.', allocation: null };
  if (reserveShortfallCents > 0) return { ...common, priority: 'reserve', title: 'Constituer la réserve de sécurité', explanation: 'Le cash allouable reste bloqué tant que la réserve configurée n’est pas atteinte.', allocation: null };
  if (speculativeShareBasisPoints !== null && speculativeShareBasisPoints > speculativeLimitBasisPoints) return { ...common, priority: 'speculative-limit', title: 'Ne pas accroître la part spéculative', explanation: 'La part crypto observée dépasse le plafond initial de 5 %. Toute allocation spéculative reste bloquée.', allocation: null };
  if (allocableCashCents === 0) return { ...common, priority: 'no-cash', title: 'Aucun cash allouable ce mois', explanation: 'Après les obligations et la sécurité, aucun montant ne peut être proposé sans fragiliser le contexte.', allocation: null };
  if (missing.length > 0) return { ...common, priority: 'missing-data', title: 'Compléter le contexte avant d’allouer', explanation: 'Le moteur garde le cash disponible mais ne le répartit pas tant que les avertissements ci-dessous ne sont pas résolus.', allocation: null };
  return { ...common, priority: 'allocation', title: 'Répartir le cash allouable', explanation: 'L’allocation est une proposition déterministe, fondée sur les poids actifs du CFO. Elle ne déclenche aucun paiement, ordre ou transfert.', allocation: allocate(allocableCashCents, ruleSet.weights) };
}

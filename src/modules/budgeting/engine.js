import { money } from '../../utils/core.js';
export function recommendBudget(product, business, economics, overrides = {}) {
  const hardDailyCeiling = Math.min(product.dailyBudgetCeiling, business.dailyBudgetCeiling);
  const hardTotalCeiling = Math.min(product.testBudgetCeiling, business.totalBudgetCeiling);
  const desiredTestBudget = money(economics.targetCPA * 20);
  const dailyBudget = money(
    overrides.dailyBudget ??
      Math.min(hardDailyCeiling, hardTotalCeiling, 300, Math.max(100, desiredTestBudget / 7)),
  );
  const durationDays =
    overrides.durationDays ??
    Math.max(1, Math.min(7, Math.floor(hardTotalCeiling / Math.max(dailyBudget, 1))));
  const totalBudget = money(dailyBudget * durationDays);
  const plannedAcquisitions =
    economics.targetCPA > 0 ? Math.floor(totalBudget / economics.targetCPA) : 0;
  return {
    currency: 'BDT',
    dailyBudget,
    durationDays,
    totalBudget,
    hardDailyCeiling,
    hardTotalCeiling,
    adSetCount: 1,
    creativeVariations: 3,
    desiredTestBudget,
    expectedDataRequirements: {
      purchasesForScaling: 20,
      spendBeforePauseReview: money(economics.targetCPA * 3),
    },
    plannedAcquisitions,
    confidence: 'Low',
    reason: `A ${durationDays}-day test capped at ৳${totalBudget}, targeting 20 purchases at the allowable CPA of ৳${economics.targetCPA}. Purchase counts are planning assumptions, not forecasts.`,
    decisionPoint:
      'Review after 3× target CPA with zero purchases; consider scaling only after 20 purchases and a profitable CPA.',
    risks: [
      'The default Bangladesh starter uses at most BDT 300/day. Small samples do not establish profitability; confirmed customer outcomes are needed before scaling.',
      ...(plannedAcquisitions < 20
        ? ['This budget may not produce enough purchases for a reliable scaling decision.']
        : []),
      ...(plannedAcquisitions > product.inventory
        ? [
            'Planned purchases at the target CPA exceed available inventory. Review stock before increasing budget.',
          ]
        : []),
    ],
  };
}

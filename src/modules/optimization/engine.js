import { money } from '../../utils/core.js';
export function recommendOptimizations(campaign, plan, metrics, rows = []) {
  const targetCPA = plan.pricingRecommendation.targetCPA;
  if (!Number.isFinite(targetCPA) || targetCPA <= 0) return [];
  const conversions = plan.conversionEvent === 'LEAD' ? 'leads' : 'purchases';
  const result = [];
  const make = (action, reason, payload = {}, risk = 'Medium') =>
    result.push({
      action,
      payload,
      reason,
      evidence: {
        spend: metrics.spend,
        [plan.conversionEvent === 'LEAD' ? 'leads' : 'purchases']: metrics.conversions,
        cpa: metrics.cpa,
        targetCPA,
      },
      confidence: 'Medium',
      riskLevel: risk,
      expectedImpact:
        action === 'update_budget'
          ? `Test a controlled budget ${payload.dailyBudget > campaign.dailyBudget ? 'increase' : 'decrease'}; actual acquisition cost may not improve.`
          : 'Limit further unprofitable spend, subject to human review.',
      requiresApproval: true,
    });
  if (metrics.spend >= targetCPA * 3 && metrics.conversions === 0)
    make(
      'pause_campaign',
      `Spend reached 3× allowable CPA without a ${plan.conversionEvent === 'LEAD' ? 'lead' : 'purchase'}.`,
    );
  else if (metrics.conversions >= 10 && metrics.cpa > targetCPA * 1.2)
    make(
      'pause_campaign',
      `CPA materially exceeds the sustainable target after at least 10 ${conversions}.`,
    );
  else if (metrics.conversions >= 10 && metrics.cpa > targetCPA)
    make(
      'update_budget',
      `CPA is moderately above the sustainable target after at least 10 ${conversions}; test a 15% reduction.`,
      { dailyBudget: money(campaign.dailyBudget * 0.85) },
    );
  else if (metrics.conversions >= 20 && metrics.cpa <= targetCPA * 0.8)
    make(
      'update_budget',
      `At least 20 ${conversions} with CPA below 80% of target; test a 15% increase.`,
      { dailyBudget: money(campaign.dailyBudget * 1.15) },
    );
  const recent = [...rows].sort((a, b) => b.date.localeCompare(a.date));
  if (
    recent.length >= 6 &&
    Date.parse(recent[0].date) - Date.parse(recent[5].date) === 5 * 86400000
  ) {
    const observedCPA = (list) => {
      const conversions = list.reduce((sum, row) => sum + row.conversions, 0);
      return conversions > 0 ? list.reduce((sum, row) => sum + row.spend, 0) / conversions : null;
    };
    const currentCPA = observedCPA(recent.slice(0, 3));
    const previousCPA = observedCPA(recent.slice(3, 6));
    if (
      currentCPA !== null &&
      previousCPA !== null &&
      previousCPA > 0 &&
      currentCPA > previousCPA * 1.5
    )
      make(
        'pause_campaign',
        'Recent 3-day acquisition cost deteriorated over 50% versus the prior 3 days.',
      );
  }
  return plan.budgetRecommendation?.deliveryMode === 'lifetime'
    ? result.filter((row) => row.action !== 'update_budget')
    : result;
}

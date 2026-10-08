import { money } from '../../utils/core.js';
export function calculateMetrics(raw) {
  for (const field of ['spend', 'impressions', 'reach', 'clicks', 'conversions'])
    if (!Number.isFinite(raw[field]) || raw[field] < 0)
      throw new Error(`Invalid performance field: ${field}`);
  if (
    raw.revenue !== null &&
    raw.revenue !== undefined &&
    (!Number.isFinite(raw.revenue) || raw.revenue < 0)
  )
    throw new Error('Invalid performance revenue');
  const ratio = (a, b, multiplier = 1) => (b > 0 ? money((a / b) * multiplier) : null);
  return {
    ...raw,
    ctr: ratio(raw.clicks, raw.impressions, 100),
    cpc: ratio(raw.spend, raw.clicks),
    cpm: ratio(raw.spend, raw.impressions, 1000),
    cpa: ratio(raw.spend, raw.conversions),
    roas: raw.revenue == null ? null : ratio(raw.revenue, raw.spend),
    conversionRate: ratio(raw.conversions, raw.clicks, 100),
    frequency: ratio(raw.impressions, raw.reach),
  };
}
export function aggregatePerformance(rows) {
  const totals = rows.reduce(
    (sum, row) => {
      for (const key of ['spend', 'impressions', 'clicks', 'conversions'])
        sum[key] += row[key] || 0;
      if (row.revenue != null) sum.revenue += row.revenue;
      else sum.revenueReliable = false;
      return sum;
    },
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
      revenue: 0,
      revenueReliable: rows.length > 0,
    },
  );
  const metrics = calculateMetrics({
    ...totals,
    reach: 0,
    revenue: totals.revenueReliable ? totals.revenue : null,
  });
  // Reach is a distinct-user metric: daily reach cannot be summed across days/campaigns.
  return {
    ...metrics,
    reach: null,
    frequency: null,
    reachNote: 'Deduplicated reach/frequency require a Meta range-level report.',
  };
}

export function explainConfidence({
  findings = [],
  retrieval,
  visualAnalysis,
  actualResults = [],
} = {}) {
  const fresh = [
    ...new Map(
      findings
        .filter(
          (item) =>
            item.verifiedBy &&
            item.classification === 'observed' &&
            item.quality === 'Verified data' &&
            /^https:\/\//.test(item.source || '') &&
            Date.parse(item.observedAt) <= Date.now() &&
            Date.now() - Date.parse(item.observedAt) < 30 * 86400000,
        )
        .map((item) => [item.source, item]),
    ).values(),
  ];
  const hosts = new Set(
    fresh.flatMap((item) => {
      try {
        return [new URL(item.source).hostname.replace(/^www\./, '')];
      } catch {
        return [];
      }
    }),
  );
  const delivered = actualResults
    .filter((item) => !item.voidedAt)
    .reduce(
      (sum, item) =>
        sum +
        (Number.isFinite(item.confirmedSales)
          ? Math.max(0, item.confirmedSales)
          : ['won', 'delivered'].includes(item.status) && Number.isFinite(item.actualCost)
            ? 1
            : 0),
      0,
    );
  const level = hosts.size >= 3 && delivered >= 20 ? 'High' : hosts.size >= 2 ? 'Medium' : 'Low';
  return {
    level,
    verifiedSourceCount: fresh.length,
    independentSourceCount: hosts.size,
    retrievedSourceCount: retrieval?.sourceCount || 0,
    imagesAnalyzed: Boolean(visualAnalysis),
    performanceLevel: delivered >= 20 ? 'Measured history' : 'Not yet established',
    confirmedSales: delivered,
    reasons:
      level === 'Low'
        ? [
            'Fewer than two fresh, independently sourced observations have been checked by the owner.',
            'AI analysis and retrieved links are useful evidence leads, not verified customer demand.',
          ]
        : level === 'Medium'
          ? [
              'At least two independent, recent sources were checked. Actual profitable acquisition still needs measurement.',
            ]
          : [
              'Multiple recent, owner-checked sources and recorded sales are available. These are user records, not an independent audit or a guarantee.',
            ],
    nextSteps: [
      'Add dated, comparable competitor offers and customer-demand evidence; check the original source.',
      'Run one capped test and record actual delivered orders, refunds, product costs and ad spend.',
      'High confidence needs at least three independent recent sources and 20 recorded confirmed sales; this threshold is a product rule, not statistical proof.',
    ],
  };
}

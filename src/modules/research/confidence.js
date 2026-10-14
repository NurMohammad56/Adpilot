export function explainConfidence({
  findings = [],
  retrieval,
  visualAnalysis,
  actualResults = [],
  adLibraryObservations = [],
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
    dimensions: {
      marketEvidence: {
        level: hosts.size >= 3 ? 'High' : hosts.size >= 2 ? 'Medium' : 'Low',
        verifiedIndependentSources: hosts.size,
        note: 'Recent owner-checked sources; not verified willingness to pay.',
      },
      comparability: {
        level: adLibraryObservations.some((r) => r.comparability === 'comparable')
          ? 'Owner checked'
          : 'Not established',
        comparableOffers: adLibraryObservations.filter((r) => r.comparability === 'comparable')
          .length,
        note: 'Confirm specifications, condition, quantity and delivery terms.',
      },
      performance: {
        level: delivered >= 20 ? 'Recorded history' : 'Limited history',
        confirmedSales: delivered,
        note: 'Recorded sales are not statistical proof or independently audited profitability.',
      },
    },
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

export function evidenceAudit(report, supplied = []) {
  const findings = [...supplied, ...(report.findings || [])];
  return {
    checkedAt: new Date().toISOString(),
    freshnessDays: 30,
    claims: findings.map((item) => ({
      claim: item.finding,
      source: /^https:\/\//.test(item.source || '') ? item.source : null,
      observedAt: item.observedAt || null,
      classification: item.classification,
      ownerChecked: Boolean(item.verifiedBy),
      stale:
        !Number.isFinite(Date.parse(item.observedAt)) ||
        Date.now() - Date.parse(item.observedAt) > 30 * 86400000,
      futureDated: Date.parse(item.observedAt) > Date.now(),
    })),
    counterEvidence: report.risks || [],
    decisionReviewTriggers: [
      ...(report.evidenceGaps || []),
      'Comparable price, specifications or delivery terms changed.',
      'Actual acquisition cost, refunds or qualified leads contradict the research hypothesis.',
      'A cited source is missing, stale or cannot support its associated claim.',
    ],
    note: 'AI findings are source leads or hypotheses until checked. Retrieved links do not certify the associated claims.',
  };
}

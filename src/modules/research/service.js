import { now } from '../../utils/core.js';
import { researchOutputSchema } from '../../ai/provider.js';
export const scoreWeights = {
  demand: 20,
  purchasingPower: 15,
  competition: 10,
  advertisingCost: 15,
  profitMargin: 15,
  customerAcquisition: 10,
  fulfillment: 5,
  growth: 5,
  risk: 5,
};
export const physicalProductWeights = {
  demand: 17,
  purchasingPower: 12,
  competition: 8,
  advertisingCost: 13,
  profitMargin: 15,
  customerAcquisition: 10,
  fulfillment: 10,
  growth: 5,
  risk: 10,
};
export function opportunityScore(components, weights = scoreWeights) {
  const complete = Object.keys(weights).every(
    (key) => Number.isFinite(components[key]) && components[key] >= 0 && components[key] <= 100,
  );
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  return {
    score: complete
      ? Math.round(
          Object.entries(weights).reduce(
            (sum, [key, weight]) => sum + components[key] * weight,
            0,
          ) / totalWeight,
        )
      : null,
    weights,
    components,
    confidence: complete ? 'Low' : 'Low',
    quality: complete ? 'Estimated data' : 'Insufficient data',
  };
}
export async function researchProduct(product, business, evidence, competitors, llm, demo) {
  const generated = await llm.generate(
    'bangladesh-market-research',
    {
      product,
      business,
      evidence,
      competitors,
      schema:
        'summary, findings[{subject,finding,source,observedAt,confidence,classification,quality}], competitorAnalysis, differentiation[], risks[]',
    },
    researchOutputSchema,
  );
  const assumptions = [
    [
      'Delivery',
      `Start within the business delivery footprint: ${business.deliveryRegions.join(', ')}. Verify per-region fulfillment and COD losses before expanding.`,
    ],
    [
      'Audience',
      'Begin with broad adult targeting. Category interests, ages, genders and purchasing power require evidence or Meta targeting lookup.',
    ],
    [
      'Creative language',
      'Test Bangla product-led copy against offer-led copy; language preference is a hypothesis.',
    ],
    [
      'Seasonality',
      'Check product relevance to Ramadan, Eid, Pohela Boishakh, winter and summer. Do not assume an event is currently in season.',
    ],
    [
      'Buyer motivation',
      `Test whether the stated benefit of ${product.name} solves a real customer problem. Collect objections from actual customers.`,
    ],
  ].map(([subject, finding]) => ({
    subject,
    finding,
    source: demo ? 'demo-fixture' : 'ai-provider',
    observedAt: now(),
    confidence: 'Low',
    classification: 'ai-generated',
    quality: 'AI-generated assumptions',
  }));
  // An LLM may suggest observations, but cannot certify provenance or mark its own output verified.
  const aiFindings = (generated?.findings || assumptions).map(({ verifiedBy, ...finding }) => ({
    ...finding,
    classification: 'ai-generated',
    quality: 'AI-generated assumptions',
    confidence: 'Low',
  }));
  const sourcedPrices = competitors
    .filter((c) => c.price > 0 && c.source && Date.now() - Date.parse(c.observedAt) < 30 * 86400000)
    .map((c) => c.price);
  return {
    market: 'BD',
    marketMode: 'LOCAL_BUSINESS',
    platform: 'META',
    generatedAt: now(),
    demo,
    summary:
      generated?.summary ||
      `An evidence-led test for ${product.name} in Bangladesh. ${evidence.length ? 'Review supplied evidence below.' : 'No independent market observations have been collected; initial recommendations are hypotheses.'}`,
    findings: [...evidence, ...aiFindings],
    competitors,
    sourcedPrices,
    competitorAnalysis:
      generated?.competitorAnalysis ||
      (competitors.length
        ? 'Compare sourced competitor prices and offers below; verify that each product is comparable.'
        : 'Competitor names and prices are unavailable. Add dated, sourced competitor observations before claiming a competitive advantage.'),
    differentiation: generated?.differentiation || [
      'Show the actual product and use case.',
      'Explain delivery coverage and the real COD policy.',
      'Test service or product benefits that can be substantiated.',
    ],
    regionalScores: business.deliveryRegions.map((region) => {
      const componentEvidence = Object.fromEntries(
        Object.keys(physicalProductWeights).map((key) => [
          key,
          evidence
            .filter(
              (e) =>
                e.subject === `${region}:${key}` &&
                Number.isFinite(e.value) &&
                e.value >= 0 &&
                e.value <= 100 &&
                Date.parse(e.observedAt) <= Date.now() &&
                Date.now() - Date.parse(e.observedAt) < 30 * 86400000,
            )
            .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] || null,
        ]),
      );
      const components = Object.fromEntries(
        Object.entries(componentEvidence).map(([key, e]) => [key, e?.value ?? null]),
      );
      return {
        region,
        ...opportunityScore(components, physicalProductWeights),
        componentEvidence,
        businessType: 'physical-product',
        reason:
          'Fulfillment and COD-related risk receive higher weights for Bangladesh physical products.',
      };
    }),
    risks: generated?.risks || [
      'Demand, purchasing power and advertising costs are unverified.',
      'COD cancellations can reduce realized contribution.',
      'Platform-reported purchases may differ from delivered orders.',
    ],
    confidence: evidence.some((e) => e.quality === 'Verified data') ? 'Medium' : 'Low',
  };
}

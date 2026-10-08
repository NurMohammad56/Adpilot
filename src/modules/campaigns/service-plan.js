import { z } from 'zod';
import { assert, hash, id, money } from '../../utils/core.js';
import { workspaceLLM } from '../../integrations/credentials.js';
import { copyOutputSchema } from '../../ai/provider.js';
import { businessPolicyHash, planFingerprint, validatePlan } from './validation.js';
import { resolveLocations } from '../research/locations.js';
export const servicePlanInput = z
  .object({
    goal: z.enum(['leads', 'purchases']),
    landingUrl: z
      .string()
      .url()
      .max(1000)
      .refine((url) => url.startsWith('https://')),
    price: z.number().positive().max(1e8).nullable(),
    deliveryCost: z.number().min(0).max(1e8).nullable(),
    requiredProfit: z.number().min(0).max(1e8).nullable(),
    leadCloseRate: z.number().positive().max(1).nullable(),
    dailyBudget: z.number().positive().max(1e8),
    durationDays: z.number().int().min(1).max(30),
    testBudgetCeiling: z.number().positive().max(1e8),
    acknowledgeUnknownCPA: z.boolean(),
    mediaAssetId: z.string().uuid(),
    thumbnailAssetId: z.string().uuid().nullable().optional(),
  })
  .strict();
export const metaIntegrationHash = (integration) =>
  hash(
    integration
      ? {
          id: integration.id,
          adAccountId: integration.adAccountId,
          pageId: integration.pageId,
          pixelId: integration.pixelId,
          locationMap: integration.locationMap,
        }
      : null,
  );
export async function createServicePlan(platform, user, versionId, input, previous = null) {
  const { version, project } = await platform.research.approved(user, versionId);
  assert(
    ['service', 'software'].includes(project.kind),
    422,
    'OFFER_KIND',
    'Use the product sales workflow for physical products',
  );
  const business = await platform.store.get('businesses', user.businessId);
  const integration = await platform.integration(user.businessId);
  const country = version.report.recommendation.country;
  const geoTargets = await resolveLocations(
    platform,
    user,
    version.report.recommendation.locationIds,
    [country],
  );
  const offerPrevious = previous ? await platform.owned('offers', previous.productId, user) : null;
  const daily = input.dailyBudget;
  const duration = input.durationDays;
  const price = input.price;
  assert(
    price === null || (input.deliveryCost !== null && input.requiredProfit !== null),
    422,
    'SERVICE_ECONOMICS',
    'Enter real delivery cost and required profit with a project price, or keep project pricing unknown',
  );
  const contribution =
    price === null ? null : money(price - input.deliveryCost - input.requiredProfit);
  const targetCPA =
    contribution === null
      ? null
      : money(
          Math.max(0, contribution) * (input.goal === 'leads' ? input.leadCloseRate || 0 : 1) * 0.7,
        ) || null;
  assert(
    contribution === null || contribution > 0,
    422,
    'SERVICE_ECONOMICS',
    'Price must cover service delivery cost and required profit',
  );
  assert(
    targetCPA !== null || input.acknowledgeUnknownCPA,
    422,
    'UNKNOWN_CPA',
    'Acknowledge that acquisition economics are unknown and this is a capped discovery test',
  );
  const offer = {
    name: project.name,
    category: project.kind,
    description: project.description,
    businessId: user.businessId,
    projectId: project.id,
    researchVersionId: version.id,
    country,
    ...input,
    dailyBudgetCeiling: previous ? offerPrevious.dailyBudgetCeiling : daily,
    revision: (offerPrevious?.revision || 0) + 1,
  };
  const risks = [
    'A single ad set uses the approved total lifetime budget. Daily spend may vary; the daily amount is a planning average, not a daily spending limit. Taxes and payment fees are additional.',
    'Country comparison and campaign outcomes are hypotheses; review current evidence.',
    ...(targetCPA === null
      ? [
          'Allowable acquisition cost is unknown. Do not scale this discovery campaign until conversion economics are measured.',
        ]
      : [
          'Lead-to-sale rate, price and delivery cost are user-supplied assumptions; validate realized results.',
        ]),
  ];
  const economics = {
    viable: contribution === null || contribution > 0,
    sellingPrice: price,
    baseVariableCost: input.deliveryCost,
    breakEvenCPA:
      price === null || (input.goal === 'leads' && !input.leadCloseRate)
        ? null
        : money((price - input.deliveryCost) * (input.goal === 'leads' ? input.leadCloseRate : 1)),
    targetCPA,
    targetROAS: input.goal === 'purchases' && targetCPA ? money(price / targetCPA) : null,
    contributionAtTargetCPA:
      targetCPA && input.goal === 'purchases'
        ? money(price - input.deliveryCost - targetCPA)
        : null,
    assumptions: risks,
    risks,
    manualTest: targetCPA === null,
    acknowledged: input.acknowledgeUnknownCPA,
    expectedReturnCost: null,
    priceRange: {
      recommended: price,
      competitive: null,
      minimumViable: null,
      premium: null,
      promotional: null,
    },
    formula:
      'Use actual service delivery cost and required profit. A lead target additionally needs a measured lead-to-sale rate. Missing values stay unknown; the test budget is a human-selected limit.',
  };
  const budget = {
    deliveryMode: 'lifetime',
    dailyBudget: daily,
    durationDays: duration,
    totalBudget: money(daily * duration),
    plannedAcquisitions: targetCPA ? Math.floor((daily * duration) / targetCPA) : null,
    reason:
      'Use the human-selected capped test budget in the connected ad account currency. No currency conversion or forecasted performance is assumed.',
    risks,
    confidence: 'Low',
  };
  const llm = await workspaceLLM(platform, user.businessId);
  const generated = previous
    ? null
    : await llm.generate(
        'campaign-copy',
        {
          offer: project.description,
          buyerProfile: project.buyerProfile,
          country,
          targetLocations: geoTargets,
          goal: input.goal,
          price,
          currency: integration?.currency || 'BDT',
          findings: version.report.findings,
          rules:
            'Write factual service/software ad copy in English unless the approved brief requests Bangla. No physical shipping, discounts, invented testimonials, or promises of business results.',
        },
        copyOutputSchema,
      );
  const copy = input.ads ||
    previous?.ads ||
    generated?.ads || [
      {
        hook: 'Build the right solution for your business',
        headline: project.name,
        primaryText: `${project.description}\nDiscuss your requirements and find out whether this offer fits your business.`,
        concept: 'Show real screenshots or an honest demonstration of the offered service.',
        language: 'English',
      },
    ];
  const ads = await Promise.all(
    copy.map((ad) =>
      platform.media.bind(user, {
        ...ad,
        id: ad.id || id(),
        cta: input.goal === 'leads' ? 'CONTACT_US' : 'SIGN_UP',
        imageUrl: ad.imageUrl || '',
        mediaAssetId: ad.mediaAssetId || input.mediaAssetId,
        thumbnailAssetId: ad.thumbnailAssetId || input.thumbnailAssetId,
        hypothesis: true,
      }),
    ),
  );
  const report = {
    ...version.report,
    confidence: 'Low',
    differentiation: version.report.recommendation.nextSteps,
    risks,
    competitorAnalysis: version.report.countries
      .map((item) => `${item.country}: ${item.competition}`)
      .join('\n'),
    competitors: [],
    regionalScores: version.report.countries.map((item) => ({
      region: item.country,
      score: null,
      confidence: 'Low',
      quality: 'Insufficient data',
      components: {},
      weights: {},
    })),
  };
  return platform.store.transaction(async () => {
    await platform.research.approved(user, version.id);
    assert(
      businessPolicyHash(await platform.store.get('businesses', user.businessId)) ===
        businessPolicyHash(business) &&
        metaIntegrationHash(await platform.integration(user.businessId)) ===
          metaIntegrationHash(integration),
      409,
      'INPUT_CHANGED',
      'Account or budget policy changed during generation',
    );
    if (previous) {
      const current = await platform.owned('campaign_plans', previous.id, user);
      assert(
        ['draft', 'pending_approval', 'rejected', 'failed'].includes(current.status),
        409,
        'PLAN_LOCKED',
        'Approved campaign plans cannot be edited',
      );
      await platform.store.update('campaign_plans', current.id, { status: 'superseded' });
      for (const approval of await platform.store.list('approval_requests', {
        planId: current.id,
        status: 'pending',
      }))
        await platform.store.update('approval_requests', approval.id, { status: 'superseded' });
    }
    const savedOffer = offerPrevious
      ? await platform.store.update('offers', offerPrevious.id, offer)
      : await platform.store.insert('offers', offer);
    for (const ad of ads) await platform.media.verify(user, ad);
    const plan = {
      id: id(),
      kind: 'service',
      businessId: user.businessId,
      productId: savedOffer.id,
      researchVersionId: version.id,
      researchProjectId: project.id,
      researchDecisionHash: version.reportHash,
      parentId: previous?.id || null,
      version: (previous?.version || 0) + 1,
      name: input.name || `${project.name} · ${country} ${input.goal} test`,
      market: country,
      marketMode: 'SERVICE_MARKET',
      platform: 'META',
      objective: input.goal === 'leads' ? 'OUTCOME_LEADS' : 'OUTCOME_SALES',
      conversionEvent: input.goal === 'leads' ? 'LEAD' : 'PURCHASE',
      accountCurrency: integration?.currency || 'BDT',
      pricingRecommendation: economics,
      budgetRecommendation: budget,
      audienceRecommendation: {
        locations: [country],
        ...(geoTargets.length ? { geoTargets } : {}),
        ageMin: input.ageMin || 18,
        ageMax: input.ageMax || 65,
        interests: [],
        segments: [{ name: 'Primary audience', active: true, profile: project.buyerProfile }],
        reason:
          'Start with a broad adult audience in the approved test country. Validate B2B segment fit through qualified leads.',
        confidence: 'Low',
      },
      locationRecommendation: {
        regions: geoTargets.length ? geoTargets.map((target) => target.name) : [country],
        confidence: 'Low',
        reason: version.report.recommendation.reason,
      },
      ads,
      research: report,
      landingUrl: input.landingUrl,
      creativeStrategy: {
        languages: [...new Set(ads.map((ad) => ad.language))],
        angles: version.report.recommendation.nextSteps,
        hypotheses: true,
      },
      campaignStructure: {
        campaignCount: 1,
        adSetCount: 1,
        adCount: ads.length,
        placements: ['Facebook', 'Instagram'],
        allocation: [{ audience: 'Approved test country', percent: 100, dailyBudget: daily }],
      },
      productSnapshotHash: hash(savedOffer),
      businessPolicyHash: businessPolicyHash(business),
      integrationHash: metaIntegrationHash(integration),
      assumptions: risks,
      risks,
      confidence: 'Low',
      successCriteria: [
        {
          metric: input.goal === 'leads' ? 'Cost per website lead' : 'CPA',
          threshold: targetCPA,
          direction: 'below',
        },
      ],
      expectedOutcomes: {
        plannedPurchasesAtTargetCPA: null,
        plannedConversionsAtTargetCPA: budget.plannedAcquisitions,
        guaranteed: false,
        quality: 'Estimated data',
      },
      requiresApproval: true,
      status: 'draft',
      createdBy: user.id,
    };
    plan.validation = validatePlan(
      plan,
      savedOffer,
      business,
      platform.config,
      platform.publicIntegration(integration),
    );
    plan.fingerprint = planFingerprint(plan);
    const saved = await platform.store.insert('campaign_plans', plan);
    await platform.audit(user, previous ? 'plan.revised' : 'plan.generated', plan.id, {
      kind: 'service',
      researchVersionId: version.id,
      country,
    });
    return saved;
  });
}

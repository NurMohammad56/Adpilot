import { z } from 'zod';
import { assert, hash, id, now, money } from '../../utils/core.js';
import { calculateEconomics } from '../pricing/engine.js';
import { researchProduct } from '../research/service.js';
import { explainConfidence } from '../research/confidence.js';
import { recommendAudience } from '../audiences/engine.js';
import { productVisualContext } from '../media/vision.js';
import { workspaceLLM } from '../../integrations/credentials.js';
import { businessPolicyHash, planFingerprint, validatePlan } from './validation.js';

export const groupInput = z
  .object({
    productIds: z.array(z.string().uuid()).min(2).max(10),
    name: z.string().trim().min(2).max(200),
    landingUrl: z
      .string()
      .url()
      .max(1000)
      .refine((url) => url.startsWith('https://')),
    dailyBudget: z.number().finite().positive().max(1e8),
    durationDays: z.number().int().min(1).max(30),
  })
  .strict();
const copySchema = z
  .object({
    primaryText: z.string().min(1).max(2200),
    headline: z.string().min(1).max(500),
    hook: z.string().min(1).max(500),
    concept: z.string().min(1).max(2000),
    language: z.enum(['Bangla', 'English', 'Banglish']),
  })
  .strict();
const accountHash = (integration) =>
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

function policyProduct(products, business, landingUrl) {
  let coverage = [...business.deliveryRegions];
  for (const product of products) {
    const regions = product.deliveryRegions || business.deliveryRegions;
    if (regions.includes('Nationwide')) continue;
    coverage = coverage.includes('Nationwide')
      ? [...regions]
      : coverage.filter((region) => regions.includes(region));
  }
  return {
    name: products.map((p) => p.name).join(' + '),
    landingUrl,
    deliveryRegions: coverage,
    dailyBudgetCeiling: Math.min(...products.map((p) => p.dailyBudgetCeiling)),
    testBudgetCeiling: Math.min(...products.map((p) => p.testBudgetCeiling)),
    inventory: Math.min(...products.map((p) => p.inventory)),
  };
}

export async function groupProduct(platform, user, plan) {
  const products = [];
  for (const member of plan.productMembers) {
    const current = await platform.owned('products', member.productId, user);
    assert(
      hash(current) === member.snapshotHash,
      409,
      'STALE_PLAN',
      'A product in this carousel changed. Build and approve a new version.',
    );
    products.push(current);
  }
  return policyProduct(
    products,
    await platform.store.get('businesses', user.businessId),
    plan.landingUrl,
  );
}

export async function createProductGroup(platform, user, input, previous = null, overrides = {}) {
  input = groupInput.parse(input);
  assert(
    new Set(input.productIds).size === input.productIds.length,
    422,
    'GROUP_PRODUCTS',
    'Select different products.',
  );
  const business = await platform.store.get('businesses', user.businessId),
    integration = await platform.integration(user.businessId);
  const products = [];
  for (const productId of input.productIds) {
    const product = await platform.owned('products', productId, user);
    assert(
      product.sellingPrice > 0 &&
        product.inventory > 0 &&
        product.landingUrl &&
        (product.mediaAssetId || product.imageUrl),
      422,
      'GROUP_PRODUCT_READY',
      'Every selected product needs a real selling price, available stock, an HTTPS product page and a product image.',
    );
    if (product.mediaAssetId)
      assert(
        (await platform.media.asset(user, product.mediaAssetId)).type === 'image',
        422,
        'CAROUSEL_IMAGE',
        'Choose a product image for every carousel card.',
      );
    products.push(product);
  }
  const policy = policyProduct(products, business, input.landingUrl);
  if (previous)
    for (const product of products)
      assert(
        hash(product) ===
          previous.productMembers.find((member) => member.productId === product.id)?.snapshotHash,
        409,
        'STALE_PRODUCT_RESEARCH',
        'A product changed. Research a new group rather than reusing the old report.',
      );
  if (overrides.queuedSnapshots)
    for (const product of products)
      assert(
        hash(product) ===
          overrides.queuedSnapshots.find((snapshot) => snapshot.id === product.id)?.hash,
        409,
        'STALE_JOB',
        'A selected product changed after queuing. Create a new group request.',
      );
  assert(
    policy.deliveryRegions.length,
    422,
    'GROUP_COVERAGE',
    'These products have no shared delivery area. Use separate campaigns.',
  );
  const members = products.map((product) => ({
    productId: product.id,
    name: product.name,
    snapshotHash: hash(product),
    economics: calculateEconomics(product),
  }));
  assert(
    members.every((m) => m.economics.viable),
    422,
    'GROUP_ECONOMICS',
    'One or more products have no room for advertising after costs and reserved profit. Check their cost preview.',
  );
  const llm = await workspaceLLM(platform, user.businessId);
  const visualReports = [];
  for (const product of products) {
    const visual = await productVisualContext(platform, user, product);
    if (visual) visualReports.push({ productId: product.id, name: product.name, ...visual });
  }
  const evidence = [],
    competitors = [];
  for (const product of products) {
    evidence.push(
      ...(await platform.store.list('market_research_reports', {
        businessId: user.businessId,
        productId: product.id,
        type: 'evidence',
      })),
    );
    competitors.push(
      ...(await platform.store.list('competitors', {
        businessId: user.businessId,
        productId: product.id,
      })),
    );
  }
  const report =
    previous?.research ||
    (await researchProduct(
      {
        name: input.name,
        description:
          'Product collection. Research every product, common buyers, category compatibility, potential cross-selling and why the group could fail. Do not claim bundle discounts.',
        products: products.map((p) => ({
          name: p.name,
          description: p.description,
          category: p.category,
          paymentMethod: p.paymentMethod,
          sellingPrice: p.sellingPrice,
        })),
        visualReports: visualReports.map((v) => ({ name: v.name, report: v.report })),
      },
      business,
      evidence,
      competitors,
      llm,
      platform.config.mode === 'demo',
      null,
      user.language || 'en',
    ));
  const relatedPlans = (
    await platform.store.list('campaign_plans', {
      businessId: user.businessId,
      kind: 'product-group',
    })
  ).filter((plan) => hash([...plan.productIds].sort()) === hash([...input.productIds].sort()));
  const relatedCampaigns = [
    ...(await platform.store.list('campaigns', { businessId: user.businessId })),
    ...(await platform.store.list('manual_campaigns', { businessId: user.businessId })),
  ].filter((campaign) => relatedPlans.some((plan) => plan.id === campaign.planId));
  const actualResults = (
    await platform.store.list('business_outcomes', { businessId: user.businessId })
  ).filter((outcome) => relatedCampaigns.some((campaign) => campaign.id === outcome.campaignId));
  const confidenceDetails = explainConfidence({
    findings: evidence,
    retrieval: report.retrieval,
    visualAnalysis: visualReports.length > 0,
    actualResults,
  });
  report.confidenceDetails = confidenceDetails;
  report.confidence = confidenceDetails.level;
  report.visualAnalyses = visualReports;
  const rawCopy = previous
    ? null
    : await llm.generate(
        'product-carousel-copy',
        {
          products: products.map((p) => ({
            name: p.name,
            description: p.description,
            price: p.sellingPrice,
          })),
          visualReports: visualReports.map((v) => ({ name: v.name, report: v.report })),
          findings: report.findings,
          rules:
            'One ad showcasing multiple distinct products; not a discounted bundle. Write clear Bangla or the supplied language. Use only supplied facts, no guaranteed benefits or invented discounts/specifications.',
        },
        copySchema,
      );
  const cards = [];
  for (const product of products) {
    const card = {
      productId: product.id,
      name: product.name,
      headline: product.name,
      description: `${product.sellingPrice.toFixed(2)} BDT`,
      link: product.landingUrl,
      sellingPrice: product.sellingPrice,
      imageUrl: product.imageUrl || '',
      ...(product.mediaAssetId ? { mediaAssetId: product.mediaAssetId } : {}),
    };
    cards.push(await platform.media.bind(user, card));
    assert(
      !cards.at(-1).mediaType || cards.at(-1).mediaType === 'image',
      422,
      'CAROUSEL_IMAGE',
      'Choose a product image for each carousel card; videos are not supported in this product carousel.',
    );
  }
  const ads = overrides.ads ||
    previous?.ads || [
      {
        ...(rawCopy || {
          hook: input.name,
          headline: input.name,
          primaryText:
            products.map((p) => `${p.name}: ${p.sellingPrice.toFixed(2)} BDT`).join('\n') +
            '\nSee each product and confirm delivery before ordering.',
          concept: 'Swipe real product photos. Each card opens that product page.',
          language: 'English',
        }),
        id: id(),
        format: 'carousel',
        cards,
        cta: 'SHOP_NOW',
        imageUrl: '',
        hypothesis: true,
      },
    ];
  const bound = [];
  for (const ad of ads) {
    assert(
      ad.format === 'carousel',
      422,
      'CAROUSEL_FORMAT',
      'Group plans use reviewed carousel cards.',
    );
    assert(
      hash(ad.cards.map((c) => ({ id: c.productId, price: c.sellingPrice, link: c.link }))) ===
        hash(cards.map((c) => ({ id: c.productId, price: c.sellingPrice, link: c.link }))),
      422,
      'CAROUSEL_PRODUCTS',
      'Card products, prices and links must match the current product group.',
    );
    bound.push(await platform.media.bind(user, ad));
  }
  const targetCPA = Math.min(...members.map((m) => m.economics.targetCPA));
  const budget = {
    currency: 'BDT',
    deliveryMode: 'lifetime',
    dailyBudget: input.dailyBudget,
    durationDays: input.durationDays,
    totalBudget: money(input.dailyBudget * input.durationDays),
    plannedAcquisitions: null,
    reason:
      'One shared lifetime budget across all product cards. Start with a small test; the system does not multiply the budget by product count.',
    risks: [
      'Meta may spend unevenly across days and cards. No per-product spend allocation or purchase count is guaranteed.',
    ],
    confidence: 'Low',
  };
  const pricing = {
    ...members.find((m) => m.economics.targetCPA === targetCPA).economics,
    sellingPrice: null,
    contributionAtTargetCPA: null,
    baseVariableCost: null,
    expectedReturnCost: null,
    breakEvenCPA: null,
    targetROAS: null,
    failureScenarios: [],
    priceRange: {
      recommended: null,
      competitive: null,
      minimumViable: null,
      premium: null,
      promotional: null,
    },
    formula:
      'Every product has its own economics. The lowest allowable acquisition cost is a conservative test guardrail, not a blended profit forecast.',
    assumptions: [
      'Prices are per product, not a bundle price. No product sales mix or average revenue is assumed.',
    ],
    risks: members.flatMap((m) => m.economics.risks),
    confidence: 'Low',
  };
  const audience = recommendAudience(
    { ...business, deliveryRegions: policy.deliveryRegions },
    report,
    overrides,
  );
  const plan = {
    id: id(),
    businessId: user.businessId,
    ...(overrides.planningJobId ? { planningJobId: overrides.planningJobId } : {}),
    productId: products[0].id,
    productIds: products.map((p) => p.id),
    productMembers: members,
    productPolicy: policy,
    kind: 'product-group',
    parentId: previous?.id || null,
    version: (previous?.version || 0) + 1,
    name: input.name,
    market: 'BD',
    platform: 'META',
    objective: 'OUTCOME_SALES',
    conversionEvent: 'PURCHASE',
    marketMode: 'LOCAL_BUSINESS',
    accountCurrency: integration?.currency || 'BDT',
    pricingRecommendation: pricing,
    budgetRecommendation: budget,
    audienceRecommendation: audience,
    locationRecommendation: {
      regions: audience.locations,
      reason: audience.reason,
      confidence: audience.confidence,
    },
    research: report,
    confidence: report.confidence,
    ads: bound,
    creativeStrategy: {
      languages: [...new Set(bound.map((a) => a.language))],
      angles: report.differentiation,
      hypotheses: true,
    },
    campaignStructure: {
      campaignCount: 1,
      adSetCount: 1,
      adCount: bound.length,
      format: 'carousel',
      productCount: products.length,
      placements: ['Facebook', 'Instagram'],
      allocation: [{ audience: 'Primary Audience', percent: 100, dailyBudget: budget.dailyBudget }],
    },
    landingUrl: input.landingUrl,
    productSnapshotHash: hash(policy),
    businessPolicyHash: businessPolicyHash(business),
    integrationHash: accountHash(integration),
    assumptions: [...pricing.assumptions, ...members.flatMap((m) => m.economics.assumptions)],
    risks: [...report.risks, ...pricing.risks, ...budget.risks],
    expectedOutcomes: { guaranteed: false, quality: 'Insufficient data' },
    successCriteria: [{ metric: 'CPA guardrail', threshold: targetCPA, direction: 'below' }],
    requiresApproval: true,
    status: 'draft',
    createdBy: user.id,
  };
  plan.validation = validatePlan(
    plan,
    policy,
    business,
    platform.config,
    platform.publicIntegration(integration),
  );
  plan.fingerprint = planFingerprint(plan);
  return platform.store.transaction(async () => {
    if (overrides.planningJobId) {
      const existing = await platform.store.find('campaign_plans', {
        businessId: user.businessId,
        planningJobId: overrides.planningJobId,
      });
      if (existing) return existing;
    }
    for (const member of members)
      assert(
        hash(await platform.owned('products', member.productId, user)) === member.snapshotHash,
        409,
        'INPUT_CHANGED',
        'A product changed while this group was researched. Regenerate the plan.',
      );
    assert(
      businessPolicyHash(await platform.store.get('businesses', user.businessId)) ===
        plan.businessPolicyHash,
      409,
      'INPUT_CHANGED',
      'Workspace policy changed while researching.',
    );
    if (previous) {
      const latest = await platform.owned('campaign_plans', previous.id, user);
      assert(
        ['draft', 'rejected', 'pending_approval'].includes(latest.status),
        409,
        'PLAN_LOCKED',
        'Create a new group after an approved plan.',
      );
      await platform.store.update('campaign_plans', previous.id, { status: 'superseded' });
      for (const approval of await platform.store.list('approval_requests', {
        businessId: user.businessId,
        planId: previous.id,
        status: 'pending',
      }))
        await platform.store.update('approval_requests', approval.id, { status: 'superseded' });
    }
    for (const ad of bound) await platform.media.verify(user, ad);
    const saved = await platform.store.insert('campaign_plans', plan);
    await platform.store.insert('ai_decisions', {
      businessId: user.businessId,
      entityType: 'product-group',
      entityId: plan.id,
      planId: plan.id,
      decisionType: 'campaign_plan',
      recommendation: plan.name,
      reason: budget.reason,
      evidence: report.findings,
      confidence: plan.confidence,
      requiresApproval: true,
    });
    await platform.audit(user, 'product_group.plan_created', plan.id, {
      productCount: products.length,
      totalBudget: budget.totalBudget,
      format: 'carousel',
    });
    return saved;
  });
}

import { assert, hash, id, money, now, publicUser, seal } from '../utils/core.js';
import { calculateEconomics } from './pricing/engine.js';
import { recommendBudget } from './budgeting/engine.js';
import { researchProduct } from './research/service.js';
import { recommendAudience } from './audiences/engine.js';
import { generateCopy } from './creatives/service.js';
import { businessPolicyHash, planFingerprint, validatePlan } from './campaigns/validation.js';
import { aggregatePerformance, calculateMetrics } from './analytics/engine.js';
import { recommendOptimizations } from './optimization/engine.js';
import { workspaceLLM, publicAI, configureAI } from '../integrations/credentials.js';
import { createServicePlan } from './campaigns/service-plan.js';

const canApprove = (user) => ['admin', 'approver'].includes(user.role);
const integrationHash = (integration) =>
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
const actionHash = (approval) =>
  hash({
    businessId: approval.businessId,
    planId: approval.planId,
    campaignId: approval.campaignId || null,
    action: approval.action,
    payload: approval.payload,
    snapshotHash: approval.snapshotHash,
    fingerprint: approval.fingerprint,
    campaignStateHash: approval.campaignStateHash || null,
    expiresAt: approval.expiresAt,
  });
const campaignStateHash = (campaign) =>
  hash({
    status: campaign.status,
    dailyBudget: campaign.dailyBudget,
    steps: campaign.steps,
    revision: campaign.stateRevision || 0,
  });
export class Platform {
  constructor(store, config, llm, meta) {
    Object.assign(this, { store, config, llm, meta });
  }
  async owned(collection, recordId, user) {
    const row = await this.store.get(collection, recordId);
    assert(row && row.businessId === user.businessId, 404, 'NOT_FOUND', 'Record not found');
    return row;
  }
  requireApprover(user) {
    assert(canApprove(user), 403, 'ROLE_REQUIRED', 'An administrator or approver is required');
  }
  async audit(user, action, entityId, detail = {}) {
    return this.store.insert('audit_logs', {
      businessId: user.businessId,
      actorId: user.id,
      action,
      entityId,
      detail,
    });
  }
  async integration(businessId) {
    return this.store.find('integrations', { businessId, provider: 'META' });
  }
  publicIntegration(integration) {
    if (!integration)
      return { configured: this.config.mode === 'demo', demo: this.config.mode === 'demo' };
    const { encryptedToken, encryptedAppSecret, ...safe } = integration;
    return {
      ...safe,
      configured: Boolean(integration.verifiedAt),
      demo: this.config.mode === 'demo',
    };
  }
  async overview(user) {
    const names = [
      'businesses',
      'products',
      'campaign_plans',
      'campaigns',
      'ad_sets',
      'ads',
      'approval_requests',
      'ad_performance',
      'optimization_recommendations',
      'audit_logs',
      'jobs',
    ];
    const rows = await Promise.all(
      names.map((name) =>
        this.store.list(
          name,
          name === 'businesses' ? { id: user.businessId } : { businessId: user.businessId },
        ),
      ),
    );
    const data = Object.fromEntries(names.map((name, i) => [name, rows[i]]));
    const metrics = aggregatePerformance(data.ad_performance.filter((r) => r.level === 'campaign'));
    return {
      user: publicUser(user),
      mode: this.config.mode,
      liveExecutionEnabled: this.config.liveExecution,
      backgroundJobsEnabled: this.config.mode === 'live' && this.config.backgroundJobs !== false,
      business: data.businesses[0],
      products: data.products,
      plans: data.campaign_plans,
      campaigns: data.campaigns,
      adSets: data.ad_sets,
      ads: data.ads,
      approvals: data.approval_requests,
      performance: data.ad_performance,
      optimizations: data.optimization_recommendations,
      audit: data.audit_logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100),
      jobs: data.jobs,
      metrics,
      integration: this.publicIntegration(await this.integration(user.businessId)),
      aiIntegration: publicAI(
        await this.store.find('integrations', { businessId: user.businessId, provider: 'AI' }),
      ),
      researchProjects: await this.store.list('research_projects', { businessId: user.businessId }),
      storage: { driver: this.media.storage.driver, readyFiles: (await this.store.list('media_assets', { businessId: user.businessId, status: 'ready' })).length },
    };
  }
  async updateBusiness(user, input) {
    assert(
      user.role === 'admin',
      403,
      'ROLE_REQUIRED',
      'Only administrators can update business policy',
    );
    return this.store.transaction(async () => {
      const business = await this.store.get('businesses', user.businessId);
      const reservations = await this.store.list('campaigns', { businessId: user.businessId });
      assert(
        reservations
          .filter((c) => ['active', 'provisioning', 'needs_reconciliation'].includes(c.status))
          .reduce((sum, c) => sum + c.dailyBudget, 0) <= input.dailyBudgetCeiling,
        422,
        'BUDGET_RESERVED',
        'Existing campaigns reserve more than the proposed daily ceiling',
      );
      assert(
        reservations.reduce((sum, c) => sum + c.totalBudget, 0) <= input.totalBudgetCeiling,
        422,
        'BUDGET_RESERVED',
        'Existing campaigns reserve more than the proposed total ceiling',
      );
      const updated = await this.store.update('businesses', business.id, {
        ...input,
        budgetVersion: (business.budgetVersion || 0) + 1,
      });
      await this.audit(user, 'business.policy_updated', business.id, input);
      return updated;
    });
  }
  async createProduct(user, input) {
    if (input.mediaAssetId) await this.media.bind(user, { mediaAssetId: input.mediaAssetId, thumbnailAssetId: input.thumbnailAssetId });
    return this.store.transaction(async () => {
      const product = await this.store.insert('products', {
        ...input,
        businessId: user.businessId,
        createdBy: user.id,
        revision: 1,
      });
      await this.store.insert('product_costs', {
        productId: product.id,
        businessId: user.businessId,
        revision: 1,
        ...input.costs,
      });
      await this.audit(user, 'product.created', product.id, { name: product.name });
      return product;
    });
  }
  async updateProduct(user, productId, input) {
    if (input.mediaAssetId) await this.media.bind(user, { mediaAssetId: input.mediaAssetId, thumbnailAssetId: input.thumbnailAssetId });
    return this.store.transaction(async () => {
      const previous = await this.owned('products', productId, user);
      const product = await this.store.update('products', productId, {
        ...input,
        revision: previous.revision + 1,
      });
      await this.store.insert('product_costs', {
        productId,
        businessId: user.businessId,
        revision: product.revision,
        ...input.costs,
      });
      await this.audit(user, 'product.updated', productId, { revision: product.revision });
      return product;
    });
  }
  async addEvidence(user, productId, input) {
    await this.owned('products', productId, user);
    return this.store.transaction(async () => {
      const row = await this.store.insert('market_research_reports', {
        type: 'evidence',
        productId,
        businessId: user.businessId,
        ...input,
        verifiedBy: user.id,
      });
      await this.audit(user, 'research.evidence_added', row.id);
      return row;
    });
  }
  async createPlan(user, productId, overrides = {}, previous = null, sourceResearch = null) {
    if (!sourceResearch && previous?.researchVersionId) sourceResearch = await this.research.approved(user, previous.researchVersionId);
    const llm = await workspaceLLM(this, user.businessId);
    const product = await this.owned('products', productId, user);
    const business = await this.store.get('businesses', user.businessId);
    const evidence = await this.store.list('market_research_reports', {
      productId,
      type: 'evidence',
      businessId: user.businessId,
    });
    const competitors = await this.store.list('competitors', {
      productId,
      businessId: user.businessId,
    });
    if (sourceResearch) assert(sourceResearch.project.kind === 'physical-product' && sourceResearch.project.productId === productId && sourceResearch.version.report.recommendation.country === 'BD', 422, 'PRODUCT_RESEARCH', 'Approved research must refer to this product and select Bangladesh.');
    const sourceReport = sourceResearch?.version.report;
    const report = sourceResearch ? {
      market: 'BD', marketMode: 'LOCAL_BUSINESS', platform: 'META', generatedAt: now(), demo: this.config.mode === 'demo',
      summary: sourceReport.summary, findings: sourceReport.findings, competitors, sourcedPrices: [],
      competitorAnalysis: sourceReport.countries.find(country => country.country === 'BD')?.competition || '',
      differentiation: sourceReport.recommendation.nextSteps, regionalScores: [],
      risks: [...sourceReport.openQuestions, ...sourceReport.countries.flatMap(country => country.risks)], confidence: 'Low',
    } : previous?.research ||
      (await researchProduct(
        product,
        business,
        evidence.map(
          ({ id: ignored, businessId: b, productId: p, createdAt, updatedAt, type, ...e }) => e,
        ),
        competitors,
        llm,
        this.config.mode === 'demo',
      ));
    const economics = calculateEconomics(product, overrides.sellingPrice, report.sourcedPrices);
    const budget = recommendBudget(product, business, economics, overrides);
    const audience = recommendAudience({ ...business, deliveryRegions: product.deliveryRegions || business.deliveryRegions }, report, overrides);
    const rawAds =
      overrides.ads || previous?.ads || (await generateCopy(product, economics, report, llm));
    const ads = await Promise.all(
      rawAds.map((ad) => (this.media ? this.media.bind(user, ad) : ad)),
    );
    const integration = await this.integration(user.businessId);
    const plan = {
      id: id(),
      businessId: user.businessId,
      productId,
      parentId: previous?.id || null,
      version: (previous?.version || 0) + 1,
      name: overrides.name || previous?.name || `${product.name} · Bangladesh sales test`,
      market: 'BD',
      platform: 'META',
      marketMode: 'LOCAL_BUSINESS',
      objective: 'OUTCOME_SALES',
      conversionEvent: 'PURCHASE',
      pricingRecommendation: economics,
      budgetRecommendation: budget,
      audienceRecommendation: audience,
      locationRecommendation: {
        regions: audience.locations,
        reason: audience.reason,
        confidence: audience.confidence,
      },
      research: report,
      confidence: report.confidence,
      ads,
      creativeStrategy: {
        languages: [...new Set(ads.map((ad) => ad.language))],
        angles: report.differentiation,
        hypotheses: true,
      },
      campaignStructure: {
        campaignCount: 1,
        adSetCount: 1,
        adCount: ads.length,
        placements: ['Facebook', 'Instagram'],
        allocation: [
          { audience: 'Primary Audience', percent: 100, dailyBudget: budget.dailyBudget },
        ],
      },
      landingUrl: product.landingUrl,
      productSnapshotHash: hash(product),
      businessPolicyHash: businessPolicyHash(business),
      integrationHash: integrationHash(integration),
      assumptions: [
        ...economics.assumptions,
        'Purchase tracking and realized delivery revenue must be validated.',
      ],
      risks: [...report.risks, ...economics.risks, ...budget.risks],
      successCriteria: [
        { metric: 'CPA', threshold: economics.targetCPA, direction: 'below' },
        { metric: 'ROAS', threshold: economics.targetROAS, direction: 'above' },
        { metric: 'Purchases before scaling review', threshold: 20, direction: 'above' },
      ],
      expectedOutcomes: {
        plannedPurchasesAtTargetCPA: budget.plannedAcquisitions,
        guaranteed: false,
        quality: 'Estimated data',
      },
      requiresApproval: true,
      status: 'draft',
      createdBy: user.id,
      ...(sourceResearch ? { researchProjectId: sourceResearch.project.id, researchVersionId: sourceResearch.version.id, researchDecisionHash: sourceResearch.version.reportHash } : {}),
    };
    plan.validation = validatePlan(
      plan,
      product,
      business,
      this.config,
      this.publicIntegration(integration),
    );
    plan.fingerprint = planFingerprint(plan);
    return this.store.transaction(async () => {
      // Evidence/API work happened outside the transaction; confirm inputs didn't change underneath it.
      if (sourceResearch) await this.research.approved(user, sourceResearch.version.id);
      assert(
        hash(await this.store.get('products', productId)) === plan.productSnapshotHash &&
          businessPolicyHash(await this.store.get('businesses', business.id)) ===
            plan.businessPolicyHash,
        409,
        'INPUT_CHANGED',
        'Business or product changed while building the plan; regenerate it',
      );
      if (previous) {
        const latest = await this.owned('campaign_plans', previous.id, user);
        assert(
          ['draft', 'pending_approval', 'rejected'].includes(latest.status),
          409,
          'PLAN_LOCKED',
          'An approved or executed plan cannot be edited; create a fresh plan',
        );
        await this.store.update('campaign_plans', previous.id, { status: 'superseded' });
        for (const a of await this.store.list('approval_requests', {
          planId: previous.id,
          status: 'pending',
        }))
          await this.store.update('approval_requests', a.id, { status: 'superseded' });
      }
      const saved = await this.store.insert('campaign_plans', plan);
      if (this.media) for (const ad of ads) await this.media.verify(user, ad);
      await this.store.insert('market_research_reports', {
        businessId: user.businessId,
        productId,
        planId: plan.id,
        type: 'report',
        ...report,
      });
      for (const [collection, value] of [
        ['pricing_recommendations', economics],
        ['budget_recommendations', budget],
        ['audience_recommendations', audience],
        ['campaign_strategies', plan.campaignStructure],
      ])
        await this.store.insert(collection, {
          businessId: user.businessId,
          productId,
          planId: plan.id,
          ...value,
        });
      for (const ad of ads)
        await this.store.insert('creatives', {
          ...ad,
          id: id(),
          creativeKey: ad.id,
          version: plan.version,
          planId: plan.id,
          businessId: user.businessId,
          productId,
        });
      await this.store.insert('ai_decisions', {
        businessId: user.businessId,
        decisionType: 'campaign_plan',
        entityType: 'product',
        entityId: productId,
        planId: plan.id,
        recommendation: plan.name,
        reason: budget.reason,
        evidence: report.findings,
        assumptions: plan.assumptions,
        confidence: plan.confidence,
        expectedImpact: plan.expectedOutcomes,
        riskLevel: plan.validation.riskLevel,
        requiresApproval: true,
      });
      await this.audit(user, previous ? 'plan.revised' : 'plan.generated', plan.id, {
        version: plan.version,
        fingerprint: plan.fingerprint,
      });
      return saved;
    });
  }
  async revisePlan(user, planId, input) {
    const previous = await this.owned('campaign_plans', planId, user);
    if (previous.kind === 'service') {
      const offer = await this.owned('offers', previous.productId, user);
      return createServicePlan(
        this,
        user,
        previous.researchVersionId,
        {
          ...offer,
          name: previous.name,
          ...input,
          price: input.sellingPrice === undefined ? offer.price : input.sellingPrice,
          ads: input.ads || previous.ads,
        },
        previous,
      );
    }
    return this.createPlan(
      user,
      previous.productId,
      {
        name: previous.name,
        sellingPrice: previous.pricingRecommendation.sellingPrice,
        dailyBudget: previous.budgetRecommendation.dailyBudget,
        durationDays: previous.budgetRecommendation.durationDays,
        locations: previous.audienceRecommendation.locations,
        ageMin: previous.audienceRecommendation.ageMin,
        ageMax: previous.audienceRecommendation.ageMax,
        ...input,
      },
      previous,
    );
  }
  async assertFresh(plan, user) {
    const product = await this.owned(
      plan.kind === 'service' ? 'offers' : 'products',
      plan.productId,
      user,
    );
    if (plan.researchVersionId) {
      const { version } = await this.research.approved(user, plan.researchVersionId);
      assert(
        version.reportHash === plan.researchDecisionHash,
        409,
        'STALE_RESEARCH',
        'Research decision changed',
      );
    }
    if (this.media) for (const ad of plan.ads) await this.media.verify(user, ad);
    const business = await this.store.get('businesses', user.businessId);
    const integration = await this.integration(user.businessId);
    assert(
      hash(product) === plan.productSnapshotHash &&
        businessPolicyHash(business) === plan.businessPolicyHash &&
        integrationHash(integration) === plan.integrationHash,
      409,
      'STALE_PLAN',
      'Product, business policy or Meta account changed. Regenerate and approve a new plan.',
    );
    const validation = validatePlan(
      plan,
      product,
      business,
      this.config,
      this.publicIntegration(integration),
    );
    assert(validation.valid, 422, 'INVALID_PLAN', 'Campaign plan failed validation', validation);
    assert(
      planFingerprint(plan) === plan.fingerprint,
      409,
      'PLAN_TAMPERED',
      'Campaign plan integrity check failed',
    );
    return { product, business, integration };
  }
  async submitPlan(user, planId) {
    return this.store.transaction(async () => {
      const plan = await this.owned('campaign_plans', planId, user);
      assert(
        ['draft', 'rejected'].includes(plan.status),
        409,
        'PLAN_STATE',
        'Plan is already submitted or locked',
      );
      await this.assertFresh(plan, user);
      const request = {
        businessId: user.businessId,
        planId,
        action: 'launch_campaign',
        payload: {},
        snapshot: plan,
        snapshotHash: hash(plan),
        fingerprint: plan.fingerprint,
        status: 'pending',
        requestedBy: user.id,
        expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
        reasoning: plan.budgetRecommendation.reason,
        risks: plan.risks,
        confidence: plan.confidence,
      };
      const approval = await this.store.insert('approval_requests', {
        ...request,
        actionHash: actionHash(request),
      });
      await this.store.update('campaign_plans', planId, { status: 'pending_approval' });
      await this.audit(user, 'approval.requested', approval.id, {
        action: approval.action,
        planId,
      });
      return approval;
    });
  }
  async decide(user, approvalId, decision, comment) {
    this.requireApprover(user);
    return this.store.transaction(async () => {
      const approval = await this.owned('approval_requests', approvalId, user);
      assert(approval.status === 'pending', 409, 'APPROVAL_STATE', 'Approval is no longer pending');
      assert(
        Date.parse(approval.expiresAt) > Date.now(),
        409,
        'APPROVAL_EXPIRED',
        'Approval expired; request a new one',
      );
      if (decision === 'approve') {
        assert(
          actionHash(approval) === approval.actionHash,
          409,
          'ACTION_TAMPERED',
          'Approval action payload changed',
        );
        if (approval.action !== 'pause_campaign') await this.assertFresh(approval.snapshot, user);
        assert(
          hash(approval.snapshot) === approval.snapshotHash,
          409,
          'SNAPSHOT_TAMPERED',
          'Approval snapshot changed',
        );
        if (approval.campaignId) await this.assertAction(approval, user);
      }
      const status = decision === 'approve' ? 'approved' : 'rejected';
      const updated = await this.store.update('approval_requests', approvalId, {
        status,
        approvedBy: decision === 'approve' ? user.id : null,
        decidedBy: user.id,
        decidedAt: now(),
        comment,
      });
      if (approval.action === 'launch_campaign')
        await this.store.update('campaign_plans', approval.planId, { status });
      if (approval.action === 'launch_campaign')
        for (const decisionRecord of await this.store.list('ai_decisions', {
          planId: approval.planId,
          businessId: user.businessId,
        }))
          await this.store.update('ai_decisions', decisionRecord.id, {
            approvedBy: decision === 'approve' ? user.id : null,
            approvedAt: decision === 'approve' ? now() : null,
            decision: status,
          });
      if (approval.optimizationId && decision === 'reject')
        await this.store.update('optimization_recommendations', approval.optimizationId, {
          status: 'rejected',
        });
      await this.store.insert('approval_actions', {
        businessId: user.businessId,
        approvalId,
        actorId: user.id,
        decision,
        comment,
        snapshotHash: approval.snapshotHash,
      });
      await this.audit(user, `approval.${status}`, approvalId, {
        comment,
        snapshotHash: approval.snapshotHash,
      });
      return updated;
    });
  }
  async assertAction(approval, user) {
    const campaign = await this.owned('campaigns', approval.campaignId, user);
    const product = await this.owned(
      approval.snapshot.kind === 'service' ? 'offers' : 'products',
      approval.snapshot.productId,
      user,
    );
    const business = await this.store.get('businesses', user.businessId);
    assert(
      ['active', 'paused'].includes(campaign.status),
      409,
      'CAMPAIGN_STATE',
      'Campaign requires reconciliation or is still provisioning',
    );
    assert(
      campaignStateHash(campaign) === approval.campaignStateHash,
      409,
      'STALE_ACTION',
      'Campaign changed since this action was proposed',
    );
    if (approval.action === 'update_budget') {
      const daily = approval.payload.dailyBudget;
      assert(
        Number.isFinite(daily) &&
          daily > 0 &&
          daily <= Math.min(product.dailyBudgetCeiling, business.dailyBudgetCeiling),
        422,
        'BUDGET_CEILING',
        'Requested budget exceeds the hard ceiling',
      );
    }
    if (approval.action === 'update_targeting') {
      const { locations, ageMin, ageMax } = approval.payload;
      assert(
        ageMin <= ageMax && ageMin >= 18 && ageMax <= 65,
        422,
        'TARGETING_INVALID',
        'Audience ages are invalid',
      );
      const allowed =
        approval.snapshot.kind === 'service'
          ? [approval.snapshot.market]
          : [
              'Dhaka',
              'Chattogram',
              'Sylhet',
              'Rajshahi',
              'Khulna',
              'Barishal',
              'Rangpur',
              'Mymensingh',
              'Nationwide',
            ];
      assert(
        locations.length &&
          locations.every(
            (region) =>
              allowed.includes(region) &&
              (approval.snapshot.kind === 'service' ||
                business.deliveryRegions.includes(region) ||
                business.deliveryRegions.includes('Nationwide')),
          ),
        422,
        'TARGETING_INVALID',
        'Targeting must stay within the Bangladesh delivery footprint',
      );
      if (this.config.mode === 'live' && approval.snapshot.kind !== 'service') {
        const integration = await this.integration(user.businessId);
        assert(
          locations.every(
            (region) =>
              region === 'Nationwide' || integration?.locationMap?.[region]?.country_code === 'BD',
          ),
          422,
          'LOCATION_UNVERIFIED',
          'Resolve each target region through Meta before requesting a change',
        );
      }
    }
    if (approval.action === 'replace_creative') {
      const ad = await this.owned('ads', approval.payload.adId, user);
      assert(
        ad.campaignId === campaign.id,
        422,
        'AD_SCOPE',
        'The selected ad does not belong to this campaign',
      );
      if (this.config.mode === 'live')
        assert(
          approval.payload.creative.mediaAssetId ||
            approval.payload.creative.imageUrl?.startsWith('https://'),
          422,
          'IMAGE_REQUIRED',
          'A live creative needs an HTTPS product image',
        );
      if (this.media) await this.media.verify(user, approval.payload.creative);
    }
    return campaign;
  }
  async proposeAction(user, campaignId, action, payload, reason, optimizationId = null) {
    if (action === 'replace_creative' && this.media)
      payload = { ...payload, creative: await this.media.bind(user, payload.creative) };
    const campaign = await this.owned('campaigns', campaignId, user);
    const plan = await this.owned('campaign_plans', campaign.planId, user);
    assert(
      [
        'pause_campaign',
        'resume_campaign',
        'update_budget',
        'update_targeting',
        'replace_creative',
      ].includes(action),
      422,
      'UNSUPPORTED_ACTION',
      'Unsupported advertising action',
    );
    return this.store.transaction(async () => {
      const approval = {
        businessId: user.businessId,
        planId: plan.id,
        campaignId,
        action,
        payload,
        snapshot: plan,
        snapshotHash: hash(plan),
        fingerprint: plan.fingerprint,
        campaignStateHash: campaignStateHash(campaign),
        status: 'pending',
        requestedBy: user.id,
        expiresAt: new Date(Date.now() + 24 * 3600000).toISOString(),
        reasoning: reason,
        confidence: 'Medium',
        risks: [
          'Performance may change. The existing total spend cap remains unchanged.',
          ...(payload.experimentLabel
            ? [`Single-variable experiment: ${payload.experimentLabel}`]
            : []),
        ],
        optimizationId,
      };
      if (action !== 'pause_campaign') await this.assertFresh(plan, user);
      await this.assertAction(approval, user);
      const saved = await this.store.insert('approval_requests', {
        ...approval,
        actionHash: actionHash(approval),
      });
      await this.audit(user, 'approval.requested', saved.id, { action, campaignId });
      if (optimizationId)
        await this.store.update('optimization_recommendations', optimizationId, {
          status: 'pending_approval',
          approvalId: saved.id,
        });
      return saved;
    });
  }
  async reserve(approvalId) {
    return this.store.transaction(async () => {
      const approval = await this.store.get('approval_requests', approvalId);
      assert(approval, 404, 'NOT_FOUND', 'Approval not found');
      if (approval.status === 'executed') return { alreadyExecuted: true, approval };
      assert(
        approval.status === 'approved',
        409,
        'APPROVAL_REQUIRED',
        'A valid human approval is required before execution',
      );
      assert(
        Date.parse(approval.expiresAt) > Date.now(),
        409,
        'APPROVAL_EXPIRED',
        'Approval has expired',
      );
      assert(
        actionHash(approval) === approval.actionHash,
        409,
        'ACTION_TAMPERED',
        'Approval action payload changed',
      );
      let actor = await this.store.get('users', approval.approvedBy);
      if (actor && actor.businessId !== approval.businessId) {
        const membership = await this.store.find('workspace_memberships', {
          userId: actor.id,
          businessId: approval.businessId,
        });
        actor = membership
          ? { ...actor, businessId: membership.businessId, role: membership.role }
          : null;
      }
      assert(
        actor && canApprove(actor) && actor.businessId === approval.businessId,
        403,
        'APPROVER_INVALID',
        'Approver no longer has permission',
      );
      assert(
        hash(approval.snapshot) === approval.snapshotHash,
        409,
        'SNAPSHOT_TAMPERED',
        'Approval snapshot changed',
      );
      const { business, integration } =
        approval.action === 'pause_campaign'
          ? {
              business: await this.store.get('businesses', actor.businessId),
              integration: await this.integration(actor.businessId),
            }
          : await this.assertFresh(approval.snapshot, actor);
      assert(
        this.config.mode === 'demo' || this.config.liveExecution,
        403,
        'LIVE_DISABLED',
        'Live execution is disabled. Complete the live setup checklist before enabling it.',
      );
      let campaign = approval.campaignId ? await this.assertAction(approval, actor) : null;
      const dailyBudget =
        approval.action === 'launch_campaign'
          ? approval.snapshot.budgetRecommendation.dailyBudget
          : approval.action === 'update_budget'
            ? approval.payload.dailyBudget
            : campaign.dailyBudget;
      const totalBudget =
        approval.action === 'launch_campaign'
          ? approval.snapshot.budgetRecommendation.totalBudget
          : campaign.totalBudget;
      const reservations = (
        await this.store.list('campaigns', { businessId: approval.businessId })
      ).filter((c) => c.id !== campaign?.id);
      if (approval.action !== 'pause_campaign') {
        assert(
          reservations
            .filter((c) => ['active', 'provisioning', 'needs_reconciliation'].includes(c.status))
            .reduce((sum, c) => sum + c.dailyBudget, 0) +
            dailyBudget <=
            business.dailyBudgetCeiling,
          422,
          'ACCOUNT_DAILY_CEILING',
          'Combined campaign budgets exceed the business daily ceiling',
        );
        assert(
          reservations.reduce((sum, c) => sum + c.totalBudget, 0) + totalBudget <=
            business.totalBudgetCeiling,
          422,
          'ACCOUNT_TOTAL_CEILING',
          'Combined campaign spend caps exceed the business total ceiling',
        );
      }
      // Writing the shared business row serializes competing Mongo transactions as well as demo requests.
      await this.store.update('businesses', business.id, {
        budgetVersion: (business.budgetVersion || 0) + 1,
      });
      if (!campaign)
        campaign = await this.store.insert('campaigns', {
          businessId: approval.businessId,
          planId: approval.planId,
          productId: approval.snapshot.productId,
          approvalId: approval.id,
          name: approval.snapshot.name,
          status: 'provisioning',
          dailyBudget,
          totalBudget,
          steps: {},
          demo: this.config.mode === 'demo',
        });
      else
        await this.store.update('campaigns', campaign.id, {
          status: 'provisioning',
          priorStatus: campaign.status,
          dailyBudget,
        });
      const locked = await this.store.update('approval_requests', approval.id, {
        status: 'executing',
        executionStartedAt: now(),
        executionCampaignId: campaign.id,
      });
      await this.audit(actor, 'execution.started', approval.id, {
        campaignId: campaign.id,
        action: approval.action,
      });
      return { approval: locked, campaign, actor, integration };
    });
  }
  async executeApproved(approvalId, toolName) {
    const expectedTools = {
      launch_campaign: 'create_campaign',
      pause_campaign: 'pause_campaign',
      resume_campaign: 'resume_campaign',
      update_budget: 'update_budget',
      update_targeting: 'update_ad_set',
      replace_creative: 'update_ad',
    };
    const before = await this.store.get('approval_requests', approvalId);
    assert(
      before && expectedTools[before.action] === toolName,
      422,
      'TOOL_ACTION_MISMATCH',
      'Tool must match the exact approved action',
    );
    const state = await this.reserve(approvalId);
    if (state.alreadyExecuted) return state.approval.result;
    const { approval, campaign, actor, integration } = state;
    try {
      let result;
      if (approval.action === 'launch_campaign') {
        const onStep = async (name, metaId) =>
          this.store.transaction(async () => {
            const current = await this.store.get('campaigns', campaign.id);
            await this.store.update('campaigns', campaign.id, {
              steps: { ...current.steps, [name]: metaId },
            });
            if (name === 'adset')
              await this.store.insert('ad_sets', {
                businessId: actor.businessId,
                campaignId: campaign.id,
                metaId,
                audience: approval.snapshot.audienceRecommendation,
              });
            if (name.startsWith('ad:'))
              await this.store.insert('ads', {
                businessId: actor.businessId,
                campaignId: campaign.id,
                metaId,
                creativeKey: name.slice(3),
              });
            await this.audit(actor, 'meta.step_completed', campaign.id, { step: name, metaId });
          });
        result = await this.meta.launch(approval.snapshot, integration, onStep);
      } else {
        const actionPayload = { ...approval.payload };
        if (approval.action === 'replace_creative')
          actionPayload.metaAdId = (await this.store.get('ads', approval.payload.adId)).metaId;
        result = await this.meta.action(
          campaign,
          approval.action,
          actionPayload,
          integration,
          approval.snapshot,
          async (metaId, assetStep = null) =>
            this.store.transaction(async () => {
              const current = await this.store.get('campaigns', campaign.id);
              await this.store.update('campaigns', campaign.id, {
                steps: {
                  ...current.steps,
                  [assetStep
                    ? `${assetStep}:replacement:${approval.id}`
                    : `replacement:${approval.id}`]: metaId,
                },
              });
              await this.audit(actor, 'meta.creative_uploaded', campaign.id, {
                approvalId: approval.id,
                metaId,
              });
            }),
        );
      }
      return await this.store.transaction(async () => {
        const status =
          approval.action === 'pause_campaign'
            ? 'paused'
            : approval.action === 'resume_campaign' || approval.action === 'launch_campaign'
              ? 'active'
              : campaign.status;
        const updated = await this.store.update('campaigns', campaign.id, {
          status,
          stateRevision: (campaign.stateRevision || 0) + 1,
          ...(approval.action === 'launch_campaign'
            ? {
                metaCampaignId: result.campaignId,
                metaAdSetId: result.adSetId,
                endTime:
                  result.endTime ||
                  new Date(
                    Date.now() + approval.snapshot.budgetRecommendation.durationDays * 86400000,
                  ).toISOString(),
              }
            : {}),
          ...(approval.action === 'update_budget'
            ? { dailyBudget: approval.payload.dailyBudget }
            : {}),
          ...(approval.action === 'update_targeting' ? { audience: approval.payload } : {}),
          executedAt: now(),
        });
        if (approval.action === 'replace_creative') {
          await this.store.insert('creatives', {
            businessId: actor.businessId,
            campaignId: campaign.id,
            adId: approval.payload.adId,
            approvalId: approval.id,
            ...approval.payload.creative,
            metaId: result.creativeId,
            hypothesis: true,
          });
          await this.store.update('ads', approval.payload.adId, {
            currentCreative: approval.payload.creative,
            metaCreativeId: result.creativeId,
          });
        }
        await this.store.update('approval_requests', approval.id, {
          status: 'executed',
          executedAt: now(),
          result: { campaignId: campaign.id, status, demo: this.config.mode === 'demo' },
        });
        if (approval.action === 'launch_campaign')
          await this.store.update('campaign_plans', approval.planId, { status: 'executed' });
        if (approval.action === 'launch_campaign')
          for (const decisionRecord of await this.store.list('ai_decisions', {
            planId: approval.planId,
            businessId: actor.businessId,
          }))
            await this.store.update('ai_decisions', decisionRecord.id, { executedAt: now() });
        if (approval.action === 'update_targeting')
          for (const adset of await this.store.list('ad_sets', {
            campaignId: campaign.id,
            businessId: actor.businessId,
          }))
            await this.store.update('ad_sets', adset.id, {
              audience: approval.payload,
              audienceRevision: updated.stateRevision,
            });
        if (approval.optimizationId)
          await this.store.update('optimization_recommendations', approval.optimizationId, {
            status: 'executed',
          });
        await this.audit(actor, 'execution.completed', approval.id, {
          campaignId: campaign.id,
          status,
        });
        return { campaignId: updated.id, status, demo: this.config.mode === 'demo' };
      });
    } catch (error) {
      await this.store.transaction(async () => {
        await this.store.update('campaigns', campaign.id, {
          status: 'needs_reconciliation',
          errorCode: error.code || 'ACTION_FAILED',
        });
        await this.store.update('approval_requests', approval.id, {
          status: 'needs_reconciliation',
          errorCode: error.code || 'ACTION_FAILED',
        });
        await this.audit(actor, 'execution.needs_reconciliation', approval.id, {
          campaignId: campaign.id,
          errorCode: error.code || 'ACTION_FAILED',
          message: 'Do not retry a mutation before verifying its remote outcome.',
        });
      });
      throw error;
    }
  }
  async syncInsights(user, campaignId) {
    const campaign = await this.owned('campaigns', campaignId, user);
    assert(campaign.metaCampaignId, 409, 'NOT_LAUNCHED', 'Campaign has not been launched');
    const plan = await this.owned('campaign_plans', campaign.planId, user);
    const integration = await this.integration(user.businessId);
    const raw = await this.meta.insights(campaign, plan, integration);
    const rows = raw.map(calculateMetrics);
    await this.store.transaction(async () => {
      for (const row of rows) {
        const existing = await this.store.find('ad_performance', {
          campaignId,
          level: row.level,
          entityId: row.entityId,
          date: row.date,
        });
        if (existing)
          await this.store.update('ad_performance', existing.id, { ...row, syncedAt: now() });
        else
          await this.store.insert('ad_performance', {
            businessId: user.businessId,
            campaignId,
            ...row,
            syncedAt: now(),
          });
      }
      await this.audit(user, 'insights.synced', campaignId, {
        records: rows.length,
        demo: this.config.mode === 'demo',
      });
    });
    return rows;
  }
  async analyze(user, campaignId) {
    const campaign = await this.owned('campaigns', campaignId, user);
    const plan = await this.owned('campaign_plans', campaign.planId, user);
    const rows = (
      await this.store.list('ad_performance', { campaignId, businessId: user.businessId })
    ).filter((r) => r.level === 'campaign');
    const metrics = aggregatePerformance(rows);
    const recommendations = recommendOptimizations(campaign, plan, metrics, rows);
    return this.store.transaction(async () => {
      const existing = await this.store.list('optimization_recommendations', {
        campaignId,
        status: 'proposed',
      });
      const saved = [];
      for (const recommendation of recommendations) {
        if (existing.some((row) => row.action === recommendation.action)) continue;
        saved.push(
          await this.store.insert('optimization_recommendations', {
            businessId: user.businessId,
            campaignId,
            ...recommendation,
            status: 'proposed',
          }),
        );
      }
      await this.audit(user, 'optimization.analyzed', campaignId, {
        metrics,
        recommendations: saved.length,
      });
      return {
        metrics,
        recommendations: saved,
        message: recommendations.length
          ? 'Recommendations require human approval before any action.'
          : 'No actionable recommendation; collect more purchase data.',
      };
    });
  }
  async configureMeta(user, input) {
    assert(
      user.role === 'admin',
      403,
      'ROLE_REQUIRED',
      'Only administrators can configure integrations',
    );
    assert(
      this.config.mode === 'live',
      409,
      'DEMO_MODE',
      'Switch to live mode before configuring real Meta credentials',
    );
    const savedConnection = await this.integration(user.businessId);
    assert(input.accessToken || savedConnection?.encryptedToken, 422, 'TOKEN_REQUIRED', 'Paste a Meta API access token to connect this workspace.', { fieldErrors: { accessToken: ['A Meta API access token is required.'] } });
    const integration = {
      businessId: user.businessId,
      provider: 'META',
      adAccountId: input.adAccountId.replace(/^act_/, ''),
      pageId: input.pageId,
      pixelId: input.pixelId,
      encryptedToken: input.accessToken ? seal(input.accessToken, this.config.encryptionKey) : savedConnection.encryptedToken,
      encryptedAppSecret: input.appSecret ? seal(input.appSecret, this.config.encryptionKey)
        : input.accessToken ? null : savedConnection?.encryptedAppSecret || null,
      locationMap: {},
    };
    const verified = await this.meta.verify(integration);
    return this.store.transaction(async () => {
      const existing = await this.integration(user.businessId);
      if (
        existing &&
        [
          existing.adAccountId !== integration.adAccountId,
          existing.pageId !== integration.pageId,
          existing.pixelId !== integration.pixelId,
        ].some(Boolean)
      ) {
        assert(
          !(await this.store.list('campaigns', { businessId: user.businessId })).length,
          409,
          'ACCOUNT_BOUND',
          'This workspace has campaigns. Create another workspace for a different account or Page.',
        );
      }
      if (existing && existing.adAccountId === integration.adAccountId)
        integration.locationMap = existing.locationMap || {};
      const value = { ...integration, ...verified, verifiedAt: now() };
      const saved = existing
        ? await this.store.update('integrations', existing.id, value)
        : await this.store.insert('integrations', value);
      await this.audit(user, 'integration.configured', saved.id, {
        adAccountId: saved.adAccountId,
        currency: saved.currency,
      });
      return this.publicIntegration(saved);
    });
  }
  async configureAI(user, input) {
    return configureAI(this, user, input);
  }
}

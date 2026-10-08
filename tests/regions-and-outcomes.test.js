import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { fixture, approved } from './helpers.js';
import { createApp } from '../src/app.js';
import { searchLocations, regionalGeo } from '../src/modules/research/locations.js';
import { projectSchema, briefOf } from '../src/modules/research/workbench.js';
import { hash } from '../src/utils/core.js';
import {
  saveOutcome,
  actualResults,
  outcomeSchema,
  outcomeCsv,
  voidOutcome,
} from '../src/modules/analytics/outcomes.js';
import { operationLocks, redisRateStore } from '../src/modules/auth/operation-lock.js';
import { LiveMetaAdapter } from '../src/integrations/meta/adapter.js';
import { validatePlan } from '../src/modules/campaigns/validation.js';
import { productInput } from './helpers.js';

const brief = {
  name: 'Custom ecommerce',
  kind: 'service',
  description: 'Custom ecommerce systems for established retailers',
  buyerProfile: 'Retail owners with integration needs',
  candidateCountries: ['DE', 'CA'],
  questions: '',
  evidence: [],
};
test('country-only approved brief hashes stay compatible and regional IDs are tenant/account scoped', async () => {
  const f = await fixture();
  assert.equal(hash(briefOf(brief)), hash(brief));
  const [bavaria] = await searchLocations(f.platform, f.user, {
    query: 'Bavaria',
    country: 'DE',
    type: 'region',
  });
  const again = await searchLocations(f.platform, f.user, {
    query: 'Bavaria',
    country: 'DE',
    type: 'region',
  });
  assert.equal(again[0].id, bavaria.id);
  const project = await f.research.create(
    f.user,
    projectSchema.parse({ ...brief, candidateLocationIds: [bavaria.id] }),
  );
  assert.equal(project.candidateLocationIds[0], bavaria.id);
  await assert.rejects(
    f.research.create(
      { ...f.user, businessId: crypto.randomUUID() },
      projectSchema.parse({ ...brief, candidateLocationIds: [bavaria.id] }),
    ),
    { code: 'NOT_FOUND' },
  );
  await assert.rejects(
    f.research.create(
      f.user,
      projectSchema.parse({
        ...brief,
        candidateCountries: ['CA'],
        candidateLocationIds: [bavaria.id],
      }),
    ),
    { code: 'LOCATION_INVALID' },
  );
  await assert.rejects(
    f.research.create(
      f.user,
      projectSchema.parse({ ...brief, candidateLocationIds: [bavaria.id, bavaria.id] }),
    ),
    { code: 'LOCATION_INVALID' },
  );
  await f.store.insert('integrations', {
    businessId: f.user.businessId,
    provider: 'META',
    adAccountId: '999',
    verifiedAt: new Date().toISOString(),
  });
  await assert.rejects(f.research.research(f.user, project.id), { code: 'LOCATION_INVALID' });
  await f.close();
});

test('regional research covers each saved area, prevents widening across countries and binds decision history', async () => {
  const f = await fixture();
  const [bavaria] = await searchLocations(f.platform, f.user, {
    query: 'Bavaria',
    country: 'DE',
    type: 'region',
  });
  const [ontario] = await searchLocations(f.platform, f.user, {
    query: 'Ontario',
    country: 'CA',
    type: 'region',
  });
  const project = await f.research.create(
    f.user,
    projectSchema.parse({ ...brief, candidateLocationIds: [bavaria.id, ontario.id] }),
  );
  const initial = await f.research.research(f.user, project.id);
  assert.deepEqual(
    initial.report.regions.map((row) => row.locationId),
    [bavaria.id, ontario.id],
  );
  assert.throws(() => f.research.validateReport(project, { ...initial.report, regions: [] }), {
    code: 'RESEARCH_REGIONS',
  });
  assert.throws(
    () =>
      f.research.validateReport(project, {
        ...initial.report,
        regions: [initial.report.regions[0], initial.report.regions[0]],
      }),
    { code: 'RESEARCH_REGIONS' },
  );
  await assert.rejects(
    f.research.edit(f.user, initial.id, {
      summary: initial.report.summary,
      recommendation: {
        ...initial.report.recommendation,
        country: 'DE',
        locationIds: [ontario.id],
      },
      note: 'Wrong-country region selection',
    }),
    { code: 'RESEARCH_REGIONS' },
  );
  const version = await f.research.edit(f.user, initial.id, {
    summary: initial.report.summary,
    recommendation: { ...initial.report.recommendation, country: 'DE', locationIds: [bavaria.id] },
    note: 'Select the researched region for testing',
  });
  await f.research.submit(f.user, version.id);
  await f.research.decide(f.user, version.id, 'approve', 'Reviewed the region and evidence gaps');
  const saved = await f.research.approved(f.user, version.id);
  assert.deepEqual(saved.version.report.recommendation.locationIds, [bavaria.id]);
  assert.deepEqual(regionalGeo([bavaria], 'DE'), { regions: [{ key: bavaria.key }] });
  assert.throws(() => regionalGeo([ontario], 'DE'), { code: 'LOCATION_INVALID' });
  await f.close();
});

test('Meta regional targeting never includes a whole-country expansion; city/region keys stay separate', async () => {
  const meta = new LiveMetaAdapter({});
  const calls = [];
  meta.request = async (integration, method, resource, payload) => {
    calls.push({ method, resource, payload });
    return { success: true };
  };
  const targets = [
    {
      id: crypto.randomUUID(),
      country: 'DE',
      type: 'region',
      key: '101',
      verifiedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      country: 'DE',
      type: 'city',
      key: '202',
      verifiedAt: new Date().toISOString(),
    },
  ];
  await meta.action(
    { metaAdSetId: '303' },
    'update_targeting',
    { locations: ['DE'], geoTargets: targets, ageMin: 18, ageMax: 65 },
    {},
    { kind: 'service', market: 'DE', audienceRecommendation: { geoTargets: targets } },
  );
  assert.deepEqual(calls[0].payload.targeting.geo_locations, {
    regions: [{ key: '101' }],
    cities: [{ key: '202' }],
  });
  assert.equal(calls[0].payload.targeting.geo_locations.countries, undefined);
  const f = await fixture();
  const { plan } = await approved(f);
  const invalid = {
    ...plan,
    audienceRecommendation: { ...plan.audienceRecommendation, geoTargets: targets },
  };
  assert.equal(
    validatePlan(invalid, f.product, await f.store.get('businesses', f.user.businessId)).valid,
    false,
  );
  await f.close();
});

test('a Bangladesh regional product campaign preserves fulfillment and narrows only inside approved areas', async () => {
  const f = await fixture();
  await f.platform.updateBusiness(f.user, {
    name: 'Nationwide shop',
    location: 'Dhaka',
    dailyBudgetCeiling: 3000,
    totalBudgetCeiling: 21000,
    deliveryRegions: ['Nationwide'],
  });
  await f.platform.updateProduct(f.user, f.product.id, {
    ...productInput,
    deliveryRegions: ['Nationwide'],
  });
  const places = [];
  for (const query of ['Dhaka', 'Chattogram', 'Sylhet'])
    places.push(
      (await searchLocations(f.platform, f.user, { query, country: 'BD', type: 'region' }))[0],
    );
  const project = await f.research.create(
    f.user,
    projectSchema.parse({
      ...brief,
      kind: 'physical-product',
      productId: f.product.id,
      candidateCountries: ['BD'],
      candidateLocationIds: places.map((row) => row.id),
    }),
  );
  const initial = await f.research.research(f.user, project.id);
  const version = await f.research.edit(f.user, initial.id, {
    summary: initial.report.summary,
    recommendation: {
      ...initial.report.recommendation,
      country: 'BD',
      locationIds: places.slice(0, 2).map((row) => row.id),
    },
    note: 'Test these two delivery regions',
  });
  await f.research.submit(f.user, version.id);
  await f.research.decide(f.user, version.id, 'approve', 'Reviewed the selected delivery regions');
  const source = await f.research.approved(f.user, version.id);
  const plan = await f.platform.createPlan(f.user, f.product.id, {}, null, source);
  assert(plan.validation.valid);
  assert(plan.budgetRecommendation.dailyBudget <= 300);
  assert.deepEqual(
    plan.audienceRecommendation.geoTargets.map((row) => row.id),
    places.slice(0, 2).map((row) => row.id),
  );
  const approval = await f.platform.submitPlan(f.user, plan.id);
  assert.deepEqual(
    (await f.store.find('audience_recommendations', { planId: plan.id })).geoTargets.map(
      (row) => row.id,
    ),
    places.slice(0, 2).map((row) => row.id),
  );
  await f.platform.decide(f.user, approval.id, 'approve', 'Approve capped demo test');
  const launched = await f.platform.executeApproved(approval.id, 'create_campaign');
  const payload = {
    locations: plan.audienceRecommendation.locations,
    ageMin: 18,
    ageMax: 65,
    locationIds: [places[0].id],
  };
  await assert.rejects(
    f.platform.proposeAction(
      f.user,
      launched.campaignId,
      'update_targeting',
      { ...payload, locationIds: [places[2].id] },
      'Widen into an unapproved region',
    ),
    { code: 'TARGETING_INVALID' },
  );
  const narrowed = await f.platform.proposeAction(
    f.user,
    launched.campaignId,
    'update_targeting',
    payload,
    'Narrow the next test into an approved region',
  );
  assert.deepEqual(
    narrowed.payload.geoTargets.map((row) => row.id),
    [places[0].id],
  );
  await f.platform.decide(
    f.user,
    narrowed.id,
    'approve',
    'Approve the narrower regional targeting',
  );
  await f.platform.executeApproved(narrowed.id, 'update_ad_set');
  assert.equal((await f.store.get('campaigns', launched.campaignId)).audience.geoTargets.length, 1);
  await saveOutcome(
    f.platform,
    f.user,
    outcomeSchema.parse({
      campaignId: launched.campaignId,
      reference: 'BD-001',
      kind: 'order',
      status: 'delivered',
      observedOn: new Date().toISOString().slice(0, 10),
      receivedRevenue: 1500,
      refunds: 0,
      actualCost: 680,
      source: 'Delivered COD ledger BD-001',
    }),
  );
  await f.platform.syncInsights(f.user, launched.campaignId);
  let researchContext;
  f.platform.llm.generate = async (task, context) => {
    if (task === 'market-comparison') researchContext = context;
    return null;
  };
  await f.research.research(
    f.user,
    project.id,
    'Review the observed COD outcome before another small test',
  );
  assert.equal(researchContext.actualBusinessResults.campaigns.length, 1);
  assert.equal(researchContext.actualBusinessResults.campaigns[0].confirmedSales, 1);
  assert.equal(researchContext.actualBusinessResults.campaigns[0].receivedRevenue, 1500);
  assert(researchContext.actualBusinessResults.campaigns[0].adSpend > 0);
  await f.close();
});

test('actual outcome references update without double counting, missing costs stay unknown and void is audited', async () => {
  const f = await fixture();
  const { plan, approval } = await approved(f);
  const executed = await f.platform.executeApproved(approval.id, 'create_campaign');
  const campaignId = executed.campaignId;
  const input = outcomeSchema.parse({
    campaignId,
    reference: 'ORD-001',
    kind: 'order',
    status: 'delivered',
    observedOn: new Date().toISOString().slice(0, 10),
    receivedRevenue: 1500,
    refunds: 0,
    actualCost: null,
    source: 'Order ledger row 001',
  });
  const created = await saveOutcome(f.platform, f.user, input);
  const period = { from: '2000-01-01', to: input.observedOn };
  assert.equal(
    (await actualResults(f.platform, f.user, period)).results[0].contributionAfterAds,
    null,
  );
  const updated = await saveOutcome(f.platform, f.user, { ...input, actualCost: 680 });
  assert.equal(updated.id, created.id);
  await assert.rejects(
    saveOutcome(f.platform, f.user, {
      ...input,
      actualCost: 700,
      expectedRevision: created.revision,
    }),
    { code: 'OUTCOME_CHANGED' },
  );
  await f.store.insert('ad_performance', {
    businessId: f.user.businessId,
    campaignId,
    level: 'campaign',
    entityId: campaignId,
    date: input.observedOn,
    spend: 300,
    syncedAt: new Date().toISOString(),
  });
  await f.store.insert('ad_performance', {
    businessId: f.user.businessId,
    campaignId,
    level: 'ad',
    entityId: 'ad-1',
    date: input.observedOn,
    spend: 300,
  });
  const result = (await actualResults(f.platform, f.user, period)).results[0];
  assert.equal(result.outcomeCount, 1);
  assert.equal(result.adSpend, 300);
  assert.equal(result.confirmedSales, 1);
  assert.equal(result.contributionAfterAds, 520);
  await assert.rejects(
    saveOutcome(f.platform, { ...f.user, businessId: crypto.randomUUID() }, input),
    { code: 'NOT_FOUND' },
  );
  await assert.rejects(voidOutcome(f.platform, { ...f.user, role: 'analyst' }, created.id), {
    code: 'ROLE_REQUIRED',
  });
  await voidOutcome(f.platform, f.user, created.id);
  assert.equal((await actualResults(f.platform, f.user, period)).results[0].outcomeCount, 0);
  assert.equal((await f.store.list('audit_logs', { action: 'outcome.voided' })).length, 1);
  assert.match(outcomeCsv([{ ...input, reference: '=HYPERLINK("evil")' }]), /'\=HYPERLINK/);
  await f.close();
});

test('outcome schemas reject fabricated payments on enquiries, refunds above receipts and impossible dates', () => {
  const base = {
    campaignId: crypto.randomUUID(),
    reference: 'L-1',
    kind: 'lead',
    status: 'qualified',
    observedOn: '2026-01-01',
    receivedRevenue: 0,
    refunds: 0,
    actualCost: null,
    source: 'Interview log',
  };
  assert.equal(outcomeSchema.safeParse(base).success, true);
  for (const update of [
    { receivedRevenue: 3 },
    { status: 'delivered' },
    { observedOn: '2026-02-31' },
    { observedOn: '2099-01-01' },
    { refunds: 10 },
  ])
    assert.equal(outcomeSchema.safeParse({ ...base, ...update }).success, false);
});

test('API keeps location catalog, actual results and account checks isolated by workspace', async () => {
  const f = await fixture();
  const app = createApp(f);
  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .set('Origin', f.config.origin)
    .send({ email: 'admin@test.local', password: 'SecureTestPassword2026!' })
    .expect(200);
  const matches = await agent
    .post('/api/research/locations/search')
    .set('Origin', f.config.origin)
    .send({ query: 'Ontario', country: 'CA', type: 'region' })
    .expect(200);
  assert.equal(matches.body[0].country, 'CA');
  await agent
    .post('/api/operations/account/check')
    .set('Origin', f.config.origin)
    .send({})
    .expect(200);
  await agent.get('/api/operations/results?from=2026-01-01&to=2026-12-31').expect(200);
  await agent.get('/api/operations/results?from=2026-12-31&to=2026-01-01').expect(422);
  await agent.get('/api/research/locations').set('x-workspace-id', crypto.randomUUID()).expect(409);
  await request(app).get('/api/research/locations').expect(401);
  await f.close();
});

test('operation locks suppress duplicate research, release after failures and keep workspace keys independent', async () => {
  const exclusive = operationLocks();
  let release;
  const pending = exclusive(
    'workspace:project',
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await assert.rejects(
    exclusive('workspace:project', async () => {}),
    { code: 'OPERATION_RUNNING' },
  );
  assert.equal(await exclusive('another-workspace:project', async () => 2), 2);
  release(1);
  assert.equal(await pending, 1);
  await assert.rejects(
    exclusive('workspace:project', async () => {
      throw new Error('Provider failed');
    }),
  );
  assert.equal(await exclusive('workspace:project', async () => 3), 3);
});

test('Meta account snapshots tolerate partial inventory permissions and bound bad pagination', async () => {
  const meta = new LiveMetaAdapter({});
  const requests = [];
  meta.request = async (_, method, resource) => {
    requests.push({ method, resource });
    if (resource === 'act_123')
      return { id: 'act_123', name: 'Account', currency: 'BDT', account_status: 1 };
    if (resource.endsWith('/adsets'))
      throw Object.assign(new Error('Unavailable'), { code: 'META_PERMISSION' });
    if (resource.endsWith('/insights'))
      throw Object.assign(new Error('Unavailable'), { code: 'META_PRIVACY' });
    if (resource.endsWith('/campaigns'))
      return {
        data: [{ id: '456', name: 'Owned campaign' }],
        paging: { next: 'https://untrusted.example', cursors: { after: 'repeated' } },
      };
    return { data: [{ id: '789', name: 'Owned ad', effective_status: 'PENDING_REVIEW' }] };
  };
  const result = await meta.accountSnapshot({ adAccountId: '123' });
  assert.equal(result.truncated, true);
  assert.equal(result.inventoryErrors.adSets, 'META_PERMISSION');
  assert.equal(result.regionalError, 'META_PRIVACY');
  assert.equal(result.ads.length, 1);
  assert(requests.every((row) => row.method === 'GET' && row.resource.startsWith('act_123')));
  assert.equal(requests.filter((row) => row.resource.endsWith('/campaigns')).length, 2);
  meta.request = async () => ({
    data: [],
    paging: { next: 'https://untrusted.example', cursors: { after: 'repeated' } },
  });
  await assert.rejects(
    meta.insights(
      { id: 'app-campaign', metaCampaignId: 'act_123/campaigns' },
      { conversionEvent: 'PURCHASE' },
      {},
    ),
    { code: 'INSIGHTS_INCOMPLETE' },
  );
});

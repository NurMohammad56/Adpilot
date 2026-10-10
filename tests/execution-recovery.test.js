import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { LiveMetaAdapter, DemoMetaAdapter } from '../src/integrations/meta/adapter.js';
import { AppError, seal } from '../src/utils/core.js';
import { fixture, approved, productInput } from './helpers.js';

test('definitive rejection before any remote mutation releases budget without reusing approval', async () => {
  class RejectingMeta extends DemoMetaAdapter {
    async launch() {
      throw new AppError(502, 'META_REJECTED', 'Spending limit too low', {
        noRemoteMutation: true,
        metaCode: 100,
        subcode: 2446307,
      });
    }
  }
  const f = await fixture({ meta: new RejectingMeta() });
  try {
    const { approval } = await approved(f, { dailyBudget: 1500, durationDays: 7 });
    await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
      code: 'META_REJECTED',
    });
    const campaign = (await f.store.list('campaigns'))[0];
    assert.equal(campaign.status, 'failed');
    assert.equal((await f.store.get('campaign_plans', approval.planId)).status, 'failed');
    assert.equal(
      (await f.store.get('approval_requests', approval.id)).executionError.subcode,
      2446307,
    );
    await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
      code: 'APPROVAL_REQUIRED',
    });
    // Failed, uncreated campaigns must not consume the workspace's total ceiling.
    await f.platform.updateBusiness(f.user, {
      name: 'Test Business',
      location: 'Dhaka',
      dailyBudgetCeiling: 1500,
      totalBudgetCeiling: 10500,
      deliveryRegions: ['Dhaka', 'Chattogram'],
    });
    const next = await approved(f, { dailyBudget: 1500, durationDays: 7 });
    await assert.rejects(f.platform.executeApproved(next.approval.id, 'create_campaign'), {
      code: 'META_REJECTED',
    });
    assert.equal((await f.store.list('campaigns')).length, 2);
  } finally {
    await f.close();
  }
});

test('missing checkpoints alone never prove that an ambiguous POST failed', async () => {
  class AmbiguousMeta extends DemoMetaAdapter {
    async launch() {
      throw new AppError(502, 'META_AMBIGUOUS', 'Network interrupted');
    }
  }
  const f = await fixture({ meta: new AmbiguousMeta() });
  try {
    const { approval } = await approved(f);
    await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
      code: 'META_AMBIGUOUS',
    });
    const campaign = (await f.store.list('campaigns'))[0];
    assert.deepEqual(campaign.steps, {});
    assert.equal(campaign.status, 'needs_reconciliation');
    assert.equal(campaign.executionError.noRemoteMutation, false);
  } finally {
    await f.close();
  }
});

test('Meta errors expose useful diagnostics while redacting credentials and marking uncertain failures', async () => {
  const encryptionKey = crypto.randomBytes(32).toString('hex'),
    token = 'secret-token-long-value',
    secret = 'secret-app-long-value';
  const adapter = new LiveMetaAdapter({ encryptionKey, metaVersion: 'v26.0' });
  const integration = {
    encryptedToken: seal(token, encryptionKey),
    encryptedAppSecret: seal(secret, encryptionKey),
  };
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 100,
            error_subcode: 2446307,
            error_user_title: 'Campaign Spending Limit Too Low',
            error_user_msg: `Limit too low ${token} ${secret} access_token=another-secret-value`,
          },
        }),
        { status: 400 },
      );
    await assert.rejects(
      adapter.request(integration, 'POST', 'act_123/campaigns', { status: 'PAUSED' }),
      (error) => {
        assert.equal(error.details.outcome, 'rejected');
        assert.equal(error.details.operation, 'POST campaigns');
        assert.equal(error.details.subcode, 2446307);
        const encoded = JSON.stringify({ message: error.message, details: error.details });
        for (const value of [token, secret, 'another-secret-value'])
          assert(!encoded.includes(value));
        assert(error.message.includes('Limit too low'));
        return true;
      },
    );
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { code: 2, is_transient: true } }), { status: 500 });
    await assert.rejects(adapter.request(integration, 'POST', 'act_123/campaigns', {}), (error) => {
      assert.equal(error.details.outcome, 'uncertain');
      return true;
    });
    globalThis.fetch = async () => new Response('gateway error', { status: 502 });
    await assert.rejects(adapter.request(integration, 'POST', 'act_123/campaigns', {}), {
      code: 'META_AMBIGUOUS',
    });
  } finally {
    globalThis.fetch = original;
  }
});

test('lifetime tests set one exact total at the ad set and validate before creating or activating ads', async () => {
  class RecordingMeta extends LiveMetaAdapter {
    constructor() {
      super({});
      this.calls = [];
    }
    async verify() {}
    async request(integration, method, resource, payload) {
      this.calls.push({ method, resource, payload });
      return payload.execution_options
        ? { success: true }
        : { id: String(this.calls.length), success: true };
    }
    async creativeStory() {
      return { page_id: 'page' };
    }
  }
  const adapter = new RecordingMeta(),
    checkpoints = [];
  const plan = {
    kind: 'service',
    market: 'CA',
    name: 'Small test',
    objective: 'OUTCOME_LEADS',
    conversionEvent: 'LEAD',
    budgetRecommendation: {
      deliveryMode: 'lifetime',
      dailyBudget: 369.01,
      totalBudget: 2583.07,
      durationDays: 7,
    },
    audienceRecommendation: { locations: ['CA'], ageMin: 18, ageMax: 65 },
    ads: [{ id: 'one', headline: 'Example', hook: 'Example' }],
  };
  await adapter.launch(plan, { adAccountId: '123', pixelId: '456' }, async (step, remoteId) =>
    checkpoints.push({ step, remoteId }),
  );
  const campaigns = adapter.calls.filter((c) => c.resource.endsWith('/campaigns'));
  assert.equal(campaigns.length, 2);
  assert.deepEqual(campaigns[0].payload.execution_options, ['validate_only']);
  assert.equal(campaigns[1].payload.spend_cap, undefined);
  assert.equal(campaigns[1].payload.status, 'PAUSED');
  const adsets = adapter.calls.filter((c) => c.resource.endsWith('/adsets'));
  assert.deepEqual(adsets[0].payload.execution_options, ['validate_only']);
  assert.equal(adsets[1].payload.lifetime_budget, 258307);
  assert.equal(adsets[1].payload.daily_budget, undefined);
  assert.equal(
    Date.parse(adsets[1].payload.end_time) - Date.parse(adsets[1].payload.start_time),
    7 * 86400000,
  );
  assert.deepEqual(
    adapter.calls.filter((c) => c.payload.status === 'ACTIVE').map((c) => c.resource),
    ['ad:one', 'adset', 'campaign'].map(
      (step) => checkpoints.find((c) => c.step === step).remoteId,
    ),
  );
  assert.deepEqual(
    checkpoints.map((c) => c.step),
    ['campaign', 'adset', 'creative:one', 'ad:one'],
  );
  const unchanged = structuredClone(plan);
  delete unchanged.budgetRecommendation.deliveryMode;
  const legacy = new RecordingMeta();
  await legacy.launch(unchanged, { adAccountId: '123' }, async () => {});
  assert.equal(
    legacy.calls.filter((c) => c.resource.endsWith('/campaigns'))[1].payload.spend_cap,
    258307,
  );
  assert.equal(
    legacy.calls.filter((c) => c.resource.endsWith('/adsets'))[1].payload.daily_budget,
    36901,
  );
});

test('a failed campaign validation creates no remote object and records that outcome', async () => {
  class RejectedMeta extends LiveMetaAdapter {
    async verify() {}
    async request(integration, method, resource, payload) {
      assert.deepEqual(payload.execution_options, ['validate_only']);
      throw new AppError(502, 'META_REJECTED', 'Spending limit too low', { outcome: 'rejected' });
    }
  }
  const meta = new RejectedMeta({});
  await assert.rejects(
    meta.launch(
      { kind: 'service', budgetRecommendation: {}, audienceRecommendation: { locations: ['CA'] } },
      { adAccountId: '123' },
      async () => assert.fail('No checkpoint may be reached'),
    ),
    (error) => {
      assert.equal(error.details.noRemoteMutation, true);
      return true;
    },
  );
});

test('development-mode creative rejection occurs before a campaign or ad set is created', async () => {
  class DevelopmentMeta extends LiveMetaAdapter {
    constructor() {
      super({});
      this.calls = [];
    }
    async verify() {}
    async creativeStory(ad, plan, integration, onAsset) {
      await onAsset('asset:image', 'uploaded-hash');
      return { page_id: '123' };
    }
    async request(integration, method, resource, payload) {
      this.calls.push({ resource, payload });
      if (resource.endsWith('/adcreatives'))
        throw new AppError(502, 'META_REJECTED', 'App is in Development mode', {
          subcode: 1885183,
          outcome: 'rejected',
        });
      assert.deepEqual(payload.execution_options, ['validate_only']);
      return { success: true };
    }
  }
  const meta = new DevelopmentMeta(),
    f = await fixture({ meta });
  try {
    await f.store.insert('integrations', {
      businessId: f.user.businessId,
      provider: 'META',
      adAccountId: '123',
      pageId: '456',
      pixelId: '789',
    });
    const { approval } = await approved(f);
    await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
      code: 'META_REJECTED',
    });
    const c = (await f.store.list('campaigns'))[0];
    assert.equal(c.status, 'failed');
    assert.equal(c.steps['asset:image'], 'uploaded-hash');
    assert.equal(c.executionError.noRemoteCampaign, true);
    assert.equal(c.executionError.noRemoteMutation, false);
    assert.equal(
      meta.calls.filter(
        (row) => row.resource.endsWith('/campaigns') && !row.payload.execution_options,
      ).length,
      0,
    );
    assert.equal(meta.calls.filter((row) => row.resource.endsWith('/adsets')).length, 0);
    assert.equal(meta.calls.filter((row) => row.payload.status === 'ACTIVE').length, 0);
  } finally {
    await f.close();
  }
});

test('live approval requires a recent successful check scoped to the plan and current account', async () => {
  const f = await fixture();
  try {
    await f.platform.updateProduct(f.user, f.product.id, {
      ...productInput,
      landingUrl: 'https://example.com',
      imageUrl: 'https://example.com/creative.png',
    });
    await f.store.insert('integrations', {
      businessId: f.user.businessId,
      provider: 'META',
      adAccountId: '123',
      pageId: '456',
      pixelId: '789',
      verifiedAt: new Date().toISOString(),
      currency: 'BDT',
      locationMap: {
        Dhaka: { country_code: 'BD', type: 'city', key: '1' },
        Chattogram: { country_code: 'BD', type: 'city', key: '2' },
      },
    });
    const plan = await f.platform.createPlan(f.user, f.product.id),
      before = structuredClone(plan);
    f.config.mode = 'live';
    await assert.rejects(f.platform.submitPlan(f.user, plan.id), {
      code: 'PLAN_PREFLIGHT_REQUIRED',
    });
    f.meta.preflight = async () => {
      throw new AppError(502, 'META_REJECTED', 'App in Development mode', { subcode: 1885183 });
    };
    const blocked = await f.platform.checkLaunch(f.user, plan.id);
    assert.equal(blocked.ok, false);
    assert.equal(blocked.issue.subcode, 1885183);
    await f.store.update('campaign_launch_checks', blocked.id, {
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    assert.deepEqual(await f.store.get('campaign_plans', plan.id), before);
    await assert.rejects(f.platform.submitPlan(f.user, plan.id), {
      code: 'PLAN_PREFLIGHT_REQUIRED',
    });
    f.meta.preflight = async () => ({ demo: false });
    const passed = await f.platform.checkLaunch(f.user, plan.id);
    assert.equal(passed.ok, true);
    assert.equal((await f.store.list('campaigns')).length, 0);
    const integration = await f.platform.integration(f.user.businessId);
    await f.store.update('integrations', integration.id, { updatedAt: '2099-01-01T00:00:00.000Z' });
    // Any provider credential/account update must invalidate the earlier check, even if asset IDs stay the same.
    await assert.rejects(f.platform.submitPlan(f.user, plan.id), {
      code: 'PLAN_PREFLIGHT_REQUIRED',
    });
    await f.platform.checkLaunch(f.user, plan.id);
    const approval = await f.platform.submitPlan(f.user, plan.id);
    assert.equal(approval.status, 'pending');
    await assert.rejects(
      f.platform.checkLaunch({ ...f.user, businessId: 'another-workspace' }, plan.id),
      { code: 'NOT_FOUND' },
    );
  } finally {
    await f.close();
  }
});

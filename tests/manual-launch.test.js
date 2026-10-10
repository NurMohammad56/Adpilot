import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { fixture, productInput } from './helpers.js';
import { createApp } from '../src/app.js';
import { AppError } from '../src/utils/core.js';
import { planFingerprint } from '../src/modules/campaigns/validation.js';
import { manualGuide } from '../src/modules/campaigns/manual-guide.js';
import { compareManualCampaign } from '../src/modules/campaigns/manual-launch.js';
import { LiveMetaAdapter } from '../src/integrations/meta/adapter.js';
import { executeViaMcp } from '../src/mcp/client.js';

async function setup() {
  const f = await fixture();
  await f.platform.updateProduct(f.user, f.product.id, {
    ...productInput,
    landingUrl: 'https://example.com/store',
    imageUrl: 'https://example.com/image.png',
  });
  const integration = await f.store.insert('integrations', {
    businessId: f.user.businessId,
    provider: 'META',
    adAccountId: '123456',
    pageId: '456789',
    pixelId: '789012',
    verifiedAt: new Date().toISOString(),
    currency: 'BDT',
    locationMap: {
      Dhaka: { country_code: 'BD', type: 'city', key: '1' },
      Chattogram: { country_code: 'BD', type: 'city', key: '2' },
    },
  });
  const plan = await f.platform.createPlan(f.user, f.product.id);
  f.config.mode = 'live';
  return { ...f, plan, integration };
}

test('manual approval works with a failed development-mode preflight but never grants API execution', async () => {
  const f = await setup();
  try {
    f.meta.preflight = async () => {
      throw new AppError(502, 'META_REJECTED', 'App Development mode', { subcode: 1885183 });
    };
    const check = await f.platform.checkLaunch(f.user, f.plan.id);
    assert.equal(check.ok, false);
    await assert.rejects(f.platform.submitPlan(f.user, f.plan.id, 'direct'), {
      code: 'PLAN_PREFLIGHT_REQUIRED',
    });
    f.meta.preflight = async () => {
      throw new Error('Manual approval must make no preflight request');
    };
    const beforeCalls = f.meta.calls.length;
    const approval = await f.platform.submitPlan(f.user, f.plan.id, 'manual');
    assert.equal(approval.action, 'manual_campaign');
    assert.equal(approval.snapshot.launchMode, 'manual');
    assert.notEqual(approval.fingerprint, f.plan.fingerprint);
    assert.equal(planFingerprint(approval.snapshot), approval.fingerprint);
    const decided = await f.platform.decide(f.user, approval.id, 'approve', 'Reviewed guide');
    await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
      code: 'TOOL_ACTION_MISMATCH',
    });
    await assert.rejects(f.platform.executeApproved(approval.id, undefined), {
      code: 'TOOL_ACTION_MISMATCH',
    });
    await assert.rejects(f.platform.reserve(approval.id), { code: 'MANUAL_NOT_EXECUTABLE' });
    await assert.rejects(executeViaMcp(decided, f.config), { code: 'MANUAL_NOT_EXECUTABLE' });
    assert.equal((await f.store.list('campaigns')).length, 0);
    assert.equal(f.meta.calls.length, beforeCalls);
    assert.equal((await f.store.get('campaign_plans', f.plan.id)).status, 'approved');
    await assert.rejects(f.platform.submitPlan(f.user, f.plan.id, 'direct'), {
      code: 'PLAN_STATE',
    });
  } finally {
    await f.close();
  }
});

test('manual submission preserves tenant, product and integrity guards', async () => {
  const f = await setup();
  try {
    await assert.rejects(
      f.platform.submitPlan({ ...f.user, businessId: 'other' }, f.plan.id, 'manual'),
      { code: 'NOT_FOUND' },
    );
    await f.store.update('campaign_plans', f.plan.id, { name: 'Tampered' });
    await assert.rejects(f.platform.submitPlan(f.user, f.plan.id, 'manual'), {
      code: 'PLAN_TAMPERED',
    });
    await f.store.update('campaign_plans', f.plan.id, { name: f.plan.name });
    await f.platform.updateProduct(f.user, f.product.id, { ...productInput, name: 'Changed' });
    await assert.rejects(f.platform.submitPlan(f.user, f.plan.id, 'manual'), {
      code: 'STALE_PLAN',
    });
    assert.equal((await f.store.list('approval_requests')).length, 0);
  } finally {
    await f.close();
  }
});

test('an expired manual approval can request fresh review without reusing or mutating its approval', async () => {
  const f = await setup();
  try {
    const old = await f.platform.submitPlan(f.user, f.plan.id, 'manual');
    await f.platform.decide(f.user, old.id, 'approve', 'Reviewed');
    await f.store.update('approval_requests', old.id, { expiresAt: '2020-01-01T00:00:00.000Z' });
    const before = await f.store.get('approval_requests', old.id);
    const renewed = await f.platform.submitPlan(f.user, f.plan.id, 'manual');
    assert.notEqual(renewed.id, old.id);
    assert.equal(renewed.action, 'manual_campaign');
    assert.equal(renewed.fingerprint, old.fingerprint);
    assert.equal(renewed.status, 'pending');
    assert.deepEqual(await f.store.get('approval_requests', old.id), before);
    await assert.rejects(f.platform.submitPlan(f.user, f.plan.id, 'manual'), {
      code: 'PLAN_STATE',
    });
    assert.equal((await f.store.list('campaigns')).length, 0);
  } finally {
    await f.close();
  }
});

test('manual guide uses the exact budget and regional decision without inventing forecasts', () => {
  const plan = {
    ...examplePlan(),
    audienceRecommendation: {
      ...examplePlan().audienceRecommendation,
      locations: ['CA'],
      geoTargets: [{ key: '2', name: 'Ontario', type: 'region' }],
    },
  };
  const guide = manualGuide(plan, exampleIntegration());
  const fields = guide.sections.flatMap((s) => s.fields);
  assert.equal(fields.find((f) => f.label === 'Budget amount').value, '2583.07 BDT');
  assert.equal(fields.find((f) => f.label === 'Locations').value, 'Ontario (region, Meta ID 2)');
  assert.equal(fields.find((f) => f.label === 'Website URL').value, plan.landingUrl);
  assert.equal(guide.creatives[0].primaryText, plan.ads[0].primaryText);
  assert(guide.unknowns.includes('not guaranteed'));
  assert(fields.every((f) => f.help && f.bn));
});

function exampleIntegration() {
  return { adAccountId: '123456', pageId: '456789', pixelId: '789012', currency: 'BDT' };
}
function examplePlan() {
  return {
    id: 'plan',
    kind: 'service',
    market: 'CA',
    name: 'Small test',
    accountCurrency: 'BDT',
    objective: 'OUTCOME_LEADS',
    conversionEvent: 'LEAD',
    landingUrl: 'https://example.com/service',
    budgetRecommendation: {
      deliveryMode: 'lifetime',
      dailyBudget: 369.01,
      totalBudget: 2583.07,
      durationDays: 7,
    },
    audienceRecommendation: {
      locations: ['CA'],
      ageMin: 18,
      ageMax: 65,
      segments: [{ active: true, profile: 'Established retailers' }],
    },
    ads: [
      {
        id: 'ad',
        headline: 'Custom ecommerce',
        primaryText: 'A reviewed offer',
        cta: 'LEARN_MORE',
      },
    ],
  };
}
function remoteFor(plan = examplePlan(), integration = exampleIntegration()) {
  return {
    account: { currency: integration.currency },
    campaign: {
      account_id: integration.adAccountId,
      objective: plan.objective,
      effective_status: 'PAUSED',
    },
    adSets: [
      {
        targeting: {
          geo_locations: { countries: ['CA'] },
          age_min: 18,
          age_max: 65,
          publisher_platforms: ['instagram', 'facebook'],
          device_platforms: ['desktop', 'mobile'],
        },
        promoted_object: { pixel_id: integration.pixelId, custom_event_type: 'LEAD' },
        optimization_goal: 'OFFSITE_CONVERSIONS',
        lifetime_budget: '258307',
        start_time: '2026-10-10T00:00:00Z',
        end_time: '2026-10-17T00:00:00Z',
      },
    ],
    ads: [
      {
        id: '987654',
        creative: {
          object_story_spec: {
            page_id: integration.pageId,
            link_data: {
              link: plan.landingUrl,
              name: plan.ads[0].headline,
              message: plan.ads[0].primaryText,
              call_to_action: { type: 'LEARN_MORE' },
            },
          },
        },
      },
    ],
  };
}

test('comparison checks exact settings, keeps media tracking unknown and detects extra locations/overspend/copy', () => {
  const plan = examplePlan(),
    integration = exampleIntegration(),
    remote = remoteFor();
  const result = compareManualCampaign(plan, integration, remote);
  assert.equal(result.status, 'settings_match');
  assert(result.pending.some((p) => p.includes('Media bytes')));
  remote.adSets[0].targeting.geo_locations.countries.push('US');
  remote.adSets[0].lifetime_budget = '999999';
  remote.ads[0].creative.object_story_spec.link_data.message = 'Changed copy';
  const changed = compareManualCampaign(plan, integration, remote);
  assert.equal(changed.status, 'mismatch');
  assert.equal(changed.checks.filter((c) => !c.matches).length, 3);
  remote.ads[0].creative = {};
  assert(
    compareManualCampaign(plan, integration, remote).pending.some((p) =>
      p.includes('did not return'),
    ),
  );
});

test('manual linking reports permission failure, remains idempotent, and rejects another account without writes', async () => {
  const f = await setup();
  try {
    const approval = await f.platform.submitPlan(f.user, f.plan.id, 'manual');
    await f.platform.decide(f.user, approval.id, 'approve', 'Reviewed');
    f.meta.inspectManualCampaign = async () => {
      throw new AppError(502, 'META_REJECTED', 'Insufficient read permission', { metaCode: 200 });
    };
    const linked = await f.platform.linkManual(f.user, approval.id, '987654');
    assert.equal(linked.verification.status, 'unverified');
    assert.equal(linked.verification.effectiveStatus, null);
    assert.equal((await f.platform.overview(f.user)).manualCampaigns.length, 1);
    assert.equal((await f.platform.linkManual(f.user, approval.id, '987654')).id, linked.id);
    await assert.rejects(f.platform.linkManual(f.user, approval.id, '111111'), {
      code: 'MANUAL_ALREADY_LINKED',
    });
    await assert.rejects(
      f.platform.linkManual({ ...f.user, businessId: 'other' }, approval.id, '987654'),
      { code: 'NOT_FOUND' },
    );
    assert.equal((await f.store.list('campaigns')).length, 0);
    f.meta.inspectManualCampaign = async () => {
      throw new AppError(422, 'MANUAL_ACCOUNT_MISMATCH', 'Other account');
    };
    await assert.rejects(f.platform.linkManual(f.user, approval.id, '987654'), {
      code: 'MANUAL_ACCOUNT_MISMATCH',
    });
    assert.equal((await f.store.list('manual_campaigns')).length, 1);
    f.meta.inspectManualCampaign = async () => {
      throw new AppError(502, 'META_REJECTED', 'Still unreadable');
    };
    const corrected = await f.platform.linkManual(f.user, approval.id, '111111', true);
    assert.equal(corrected.id, linked.id);
    assert.equal(corrected.metaCampaignId, '111111');
    assert.equal(corrected.priorReportedIds[0].metaCampaignId, '987654');
    await f.store.update('manual_campaigns', linked.id, {
      verification: { status: 'settings_match', effectiveStatus: 'PAUSED' },
    });
    await assert.rejects(f.platform.linkManual(f.user, approval.id, '222222', true), {
      code: 'MANUAL_ALREADY_LINKED',
    });
  } finally {
    await f.close();
  }
});

test('manual inspector only reads, checks account before reading edges, and refuses incomplete pagination', async () => {
  const adapter = new LiveMetaAdapter({}),
    calls = [];
  adapter.request = async (integration, method, path) => {
    calls.push({ method, path });
    return { account_id: 'other' };
  };
  await assert.rejects(adapter.inspectManualCampaign('987654', exampleIntegration()), {
    code: 'MANUAL_ACCOUNT_MISMATCH',
  });
  assert.equal(calls.length, 1);
  adapter.request = async (integration, method, path) => {
    calls.push({ method, path });
    if (path === '987654') return { account_id: '123456' };
    if (path.startsWith('act_')) return { currency: 'BDT' };
    return {
      data: [],
      paging: { next: 'https://malicious.test/?access_token=ignored', cursors: { after: 'same' } },
    };
  };
  await assert.rejects(adapter.inspectManualCampaign('987654', exampleIntegration()), {
    code: 'MANUAL_READ_INCOMPLETE',
  });
  assert(calls.every((c) => c.method === 'GET' && !c.path.includes('malicious')));
});

test('read-only manual insights use attributed event families without double counting or inventing revenue', async () => {
  const adapter = new LiveMetaAdapter({}),
    calls = [];
  adapter.request = async (integration, method, resource) => {
    calls.push(method);
    if (resource === '987654') return { account_id: '123456' };
    if (resource.startsWith('act_')) return { currency: 'BDT' };
    if (resource.endsWith('/insights'))
      return {
        data: [
          {
            date_start: '2026-09-10',
            date_stop: '2026-10-09',
            spend: '100.25',
            impressions: '1000',
            clicks: '30',
            actions: [
              { action_type: 'lead', value: '4' },
              { action_type: 'offsite_conversion.fb_pixel_lead', value: '4' },
            ],
          },
        ],
      };
    return { data: [] };
  };
  const result = await adapter.inspectManualCampaign('987654', exampleIntegration());
  assert.equal(result.insights.spend, 100.25);
  assert.equal(result.insights.leads, 4);
  assert.equal(result.insights.purchases, 0);
  assert.equal(result.insights.revenue, undefined);
  assert(calls.every((method) => method === 'GET'));
});

test('HTTP manual approval cannot call execution and unknown modes or arbitrary URLs are rejected', async () => {
  const f = await fixture();
  try {
    const app = createApp(f),
      agent = request.agent(app),
      origin = 'http://localhost:5173';
    await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: 'admin@test.local', password: 'SecureTestPassword2026!' })
      .expect(200);
    const plan = await f.platform.createPlan(f.user, f.product.id);
    await agent
      .post(`/api/plans/${plan.id}/submit`)
      .set('Origin', origin)
      .send({ launchMode: 'fake' })
      .expect(422);
    const submitted = await agent
      .post(`/api/plans/${plan.id}/submit`)
      .set('Origin', origin)
      .send({ launchMode: 'manual' })
      .expect(201);
    await agent
      .post(`/api/approvals/${submitted.body.id}/decision`)
      .set('Origin', origin)
      .send({ decision: 'approve', comment: 'Reviewed' })
      .expect(200);
    const rejected = await agent
      .post(`/api/approvals/${submitted.body.id}/execute`)
      .set('Origin', origin)
      .send({})
      .expect(422);
    assert.equal(rejected.body.error.code, 'MANUAL_NOT_EXECUTABLE');
    await agent
      .post(`/api/approvals/${submitted.body.id}/manual-campaign`)
      .set('Origin', origin)
      .send({ metaCampaignId: 'https://example.com' })
      .expect(422);
    assert.equal((await f.store.list('campaigns')).length, 0);
  } finally {
    await f.close();
  }
});

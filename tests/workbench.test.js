import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fixture } from './helpers.js';
import { createApp } from '../src/app.js';
import { createStorage } from '../src/storage/index.js';
import { projectSchema } from '../src/modules/research/workbench.js';
import { createServicePlan } from '../src/modules/campaigns/service-plan.js';
import { workspaceLLM } from '../src/integrations/credentials.js';
import { seal, unseal } from '../src/utils/core.js';
import { LiveMetaAdapter } from '../src/integrations/meta/adapter.js';
import { recommendOptimizations } from '../src/modules/optimization/engine.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=',
  'base64',
);
const brief = {
  name: 'Custom ecommerce development',
  kind: 'service',
  description: 'Custom online stores built for established retail businesses.',
  buyerProfile: 'Retail owners who need a custom ecommerce application.',
  candidateCountries: ['BD', 'US', 'GB'],
  questions: 'Compare buyer readiness and competition.',
  evidence: [],
};
const origin = 'http://localhost:5173';
async function fileFixture(f) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'adpilot-media-test-'));
  assert(root.startsWith(path.join(os.tmpdir(), 'adpilot-media-test-')));
  f.media.storage = createStorage({
    storageDriver: 'local',
    storagePath: path.join(root, 'files'),
  });
  const upload = async (bytes = png, name = 'creative.png') => {
    const filename = path.join(root, crypto.randomUUID());
    await fs.writeFile(filename, bytes);
    return f.media.upload(f.user, { path: filename, originalname: name, size: bytes.length });
  };
  return { root, upload, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}
async function approvedResearch(f) {
  const project = await f.research.create(f.user, projectSchema.parse(brief));
  const initial = await f.research.research(f.user, project.id);
  const edited = await f.research.edit(f.user, initial.id, {
    summary: initial.report.summary,
    recommendation: {
      ...initial.report.recommendation,
      country: 'US',
      reason: 'Choose a capped US test after reviewing the uncertainty and customer fit.',
    },
    note: 'Select a test country for a controlled validation.',
  });
  await f.research.submit(f.user, edited.id);
  const version = await f.research.decide(
    f.user,
    edited.id,
    'approve',
    'Reviewed the hypotheses and selected test market.',
  );
  return { project, initial, version };
}
test('research supports repeat questions, immutable history, decision edits and human approval', async () => {
  const f = await fixture();
  const { project, initial, version } = await approvedResearch(f);
  assert.equal(
    (await f.store.get('research_versions', initial.id)).report.recommendation.country,
    null,
  );
  assert.equal(version.number, 2);
  assert.equal((await f.research.approved(f.user, version.id)).project.status, 'approved');
  const followup = await f.research.research(
    f.user,
    project.id,
    'Compare acquisition barriers for US retail owners.',
  );
  assert.equal(followup.parentId, version.id);
  assert.equal(followup.number, 3);
  assert.equal((await f.store.get('research_versions', version.id)).status, 'approved');
  await assert.rejects(f.research.approved(f.user, version.id), {
    code: 'RESEARCH_APPROVAL_REQUIRED',
  });
  await assert.rejects(
    f.research.edit(f.user, version.id, {
      summary: 'New summary',
      recommendation: version.report.recommendation,
      note: 'Old version edit',
    }),
    { code: 'STALE_RESEARCH' },
  );
  await f.close();
});
test('editing a brief invalidates pending review and blocks an analyst from approving', async () => {
  const f = await fixture();
  const { project, version } = await approvedResearch(f);
  await assert.rejects(
    f.research.decide(
      { ...f.user, role: 'analyst' },
      version.id,
      'approve',
      'Attempted analyst review',
    ),
    { code: 'ROLE_REQUIRED' },
  );
  await f.research.update(
    f.user,
    project.id,
    projectSchema.parse({ ...brief, candidateCountries: ['US', 'GB'] }),
  );
  await assert.rejects(f.research.approved(f.user, version.id), {
    code: 'RESEARCH_APPROVAL_REQUIRED',
  });
  await assert.rejects(
    f.research.research({ ...f.user, businessId: crypto.randomUUID() }, project.id),
    { code: 'NOT_FOUND' },
  );
  await f.close();
});
test('workspace switching requires membership and separates products, media, research and provider settings', async () => {
  const f = await fixture();
  const session = await f.auth.session(f.user);
  const space = await f.auth.createWorkspace(f.user, 'Second client');
  const switched = await f.auth.switchWorkspace(session.token, space.id);
  assert.equal(switched.role, 'admin');
  assert.equal(switched.businessId, space.id);
  const data = await f.platform.overview(await f.auth.resolve(session.token));
  assert.equal(data.products.length, 0);
  assert.equal(data.integration.demo, true);
  await assert.rejects(f.platform.owned('products', f.product.id, switched), { code: 'NOT_FOUND' });
  await assert.rejects(f.auth.switchWorkspace(session.token, crypto.randomUUID()), {
    code: 'WORKSPACE_ACCESS',
  });
  assert.equal((await f.auth.workspaces(switched)).length, 2);
  const agent = request.agent(createApp(f));
  await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: f.user.email, password: 'SecureTestPassword2026!' })
    .expect(200);
  await agent
    .post('/api/workspaces/switch')
    .set('Origin', origin)
    .send({ businessId: space.id })
    .expect(200);
  const users = await agent.get('/api/users').expect(200);
  assert.ok(users.body.some((user) => user.id === f.user.id));
  const staleTab = await agent
    .post('/api/research')
    .set('Origin', origin)
    .set('X-Workspace-Id', f.user.businessId)
    .send(brief)
    .expect(409);
  assert.equal(staleTab.body.error.code, 'WORKSPACE_CHANGED');
  assert.equal((await f.store.list('research_projects', { businessId: space.id })).length, 0);
  await f.close();
});
test('uploads validate real file signatures, stay private, support byte ranges and reject cross-workspace selection', async () => {
  const f = await fixture();
  const media = await fileFixture(f);
  try {
    const asset = await media.upload();
    assert.equal(asset.type, 'image');
    assert.equal(asset.storageKey, undefined);
    const agent = request.agent(createApp(f));
    await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: f.user.email, password: 'SecureTestPassword2026!' })
      .expect(200);
    const content = await agent.get(asset.contentUrl).set('Range', 'bytes=0-7').expect(206);
    assert.equal(content.headers['content-range'], `bytes 0-7/${png.length}`);
    await request(createApp(f)).get(asset.contentUrl).expect(401);
    const second = await f.auth.createWorkspace(f.user, 'Other client');
    await agent
      .post('/api/workspaces/switch')
      .set('Origin', origin)
      .send({ businessId: second.id })
      .expect(200);
    await agent.get(asset.contentUrl).expect(404);
    await assert.rejects(
      f.media.bind({ ...f.user, businessId: second.id }, { mediaAssetId: asset.id }),
      { code: 'NOT_FOUND' },
    );
    await assert.rejects(media.upload(Buffer.from('<script>alert(1)</script>'), 'photo.png'), {
      code: 'FILE_TYPE',
    });
    await assert.rejects(
      f.media
        .bind(f.user, { mediaAssetId: asset.id, mediaType: 'image', assetChecksum: '0'.repeat(64) })
        .then((current) => f.media.verify(f.user, { ...current, assetChecksum: '0'.repeat(64) })),
      { code: 'MEDIA_CHANGED' },
    );
  } finally {
    await media.cleanup();
    await f.close();
  }
});
test('service campaign uses an approved country and uploaded media, and needs a separate launch approval', async () => {
  const f = await fixture();
  const media = await fileFixture(f);
  try {
    const asset = await media.upload();
    const { project, version } = await approvedResearch(f);
    const input = {
      goal: 'leads',
      landingUrl: 'https://example.com/custom-ecommerce',
      price: 20000,
      deliveryCost: 10000,
      requiredProfit: 4000,
      leadCloseRate: 0.1,
      dailyBudget: 100,
      durationDays: 7,
      testBudgetCeiling: 1000,
      acknowledgeUnknownCPA: false,
      mediaAssetId: asset.id,
    };
    const plan = await createServicePlan(f.platform, f.user, version.id, input);
    assert.equal(plan.market, 'US');
    assert.equal(plan.objective, 'OUTCOME_LEADS');
    assert.equal(plan.conversionEvent, 'LEAD');
    assert.equal(plan.ads[0].assetChecksum, asset.checksum);
    assert.equal(plan.validation.valid, true);
    const approval = await f.platform.submitPlan(f.user, plan.id);
    await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
      code: 'APPROVAL_REQUIRED',
    });
    await f.platform.decide(
      f.user,
      approval.id,
      'approve',
      'Approved this exact service campaign test.',
    );
    const result = await f.platform.executeApproved(approval.id, 'create_campaign');
    assert.ok(result.campaignId);
    const campaign = (await f.store.list('campaigns', { businessId: f.user.businessId }))[0];
    const rows = await f.platform.syncInsights(f.user, campaign.id);
    assert.equal(rows[0].revenue, null);
    await f.research.research(f.user, project.id, 'Reconsider the selected market.');
    await assert.rejects(f.platform.assertFresh(plan, f.user), {
      code: 'RESEARCH_APPROVAL_REQUIRED',
    });
  } finally {
    await media.cleanup();
    await f.close();
  }
});
test('unknown service economics never invent allowable CPA or scaling recommendations', async () => {
  const f = await fixture();
  const media = await fileFixture(f);
  try {
    const asset = await media.upload();
    const { version } = await approvedResearch(f);
    const input = {
      goal: 'leads',
      landingUrl: 'https://example.com',
      price: null,
      deliveryCost: 0,
      requiredProfit: 0,
      leadCloseRate: null,
      dailyBudget: 100,
      durationDays: 7,
      testBudgetCeiling: 1000,
      acknowledgeUnknownCPA: false,
      mediaAssetId: asset.id,
    };
    await assert.rejects(createServicePlan(f.platform, f.user, version.id, input), {
      code: 'UNKNOWN_CPA',
    });
    const plan = await createServicePlan(f.platform, f.user, version.id, {
      ...input,
      acknowledgeUnknownCPA: true,
    });
    assert.equal(plan.pricingRecommendation.targetCPA, null);
    assert.equal(plan.budgetRecommendation.plannedAcquisitions, null);
    assert.deepEqual(
      recommendOptimizations({ dailyBudget: 100 }, plan, {
        spend: 5000,
        conversions: 0,
        cpa: null,
      }),
      [],
    );
    const edited = await f.platform.revisePlan(f.user, plan.id, {
      ads: plan.ads.map((ad) => ({ ...ad, headline: 'Updated real offer headline' })),
    });
    assert.equal(edited.ads[0].headline, 'Updated real offer headline');
    assert.equal(edited.researchVersionId, version.id);
  } finally {
    await media.cleanup();
    await f.close();
  }
});
test('AI credentials are encrypted, workspace scoped and absent from browser responses', async () => {
  const f = await fixture();
  f.config.mode = 'live';
  f.config.encryptionKey = crypto.randomBytes(32).toString('hex');
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ name: 'models/test-model' }));
  try {
    const result = await f.platform.configureAI(f.user, {
      provider: 'gemini',
      apiKey: 'private-test-provider-key',
      model: 'test-model',
      grounding: false,
    });
    assert.equal(result.apiKey, undefined);
    const row = await f.store.find('integrations', {
      businessId: f.user.businessId,
      provider: 'AI',
    });
    assert.equal(unseal(row.encryptedKey, f.config.encryptionKey), 'private-test-provider-key');
    assert.ok(
      !JSON.stringify(await f.platform.overview(f.user)).includes('private-test-provider-key'),
    );
    const llm = await workspaceLLM(f.platform, f.user.businessId);
    assert.equal(llm.config.llmKey, 'private-test-provider-key');
    await assert.rejects(workspaceLLM(f.platform, crypto.randomUUID()), {
      code: 'AI_NOT_CONFIGURED',
    });
  } finally {
    globalThis.fetch = original;
    await f.close();
  }
});
test('live lead launch maps approved country, event and uploaded image without using a public asset URL', async () => {
  const adapter = new LiveMetaAdapter({});
  adapter.verify = async () => ({});
  adapter.media = {
    readBytes: async () => ({ bytes: png, asset: { id: 'asset', type: 'image' } }),
  };
  const calls = [];
  adapter.request = async (integration, method, resource, payload) => {
    calls.push({ method, resource, payload });
    return resource.endsWith('/adimages')
      ? { images: { image: { hash: 'uploaded-hash' } } }
      : { id: `remote-${calls.length}` };
  };
  const plan = {
    kind: 'service',
    businessId: 'tenant',
    name: 'Service test',
    objective: 'OUTCOME_LEADS',
    conversionEvent: 'LEAD',
    landingUrl: 'https://example.com/contact',
    budgetRecommendation: { dailyBudget: 100, totalBudget: 700, durationDays: 7 },
    audienceRecommendation: { locations: ['US'], ageMin: 18, ageMax: 65 },
    ads: [
      {
        id: 'creative',
        mediaAssetId: 'asset',
        assetChecksum: 'digest',
        headline: 'Real service',
        primaryText: 'Discuss your requirements',
        cta: 'CONTACT_US',
      },
    ],
  };
  await adapter.launch(plan, { adAccountId: '123', pageId: '456', pixelId: '789' }, async () => {});
  assert.equal(
    calls.find((call) => call.resource.endsWith('/campaigns')).payload.objective,
    'OUTCOME_LEADS',
  );
  assert.deepEqual(
    calls.find((call) => call.resource.endsWith('/adsets')).payload.targeting.geo_locations,
    { countries: ['US'] },
  );
  assert.equal(
    calls.find((call) => call.resource.endsWith('/adsets')).payload.promoted_object
      .custom_event_type,
    'LEAD',
  );
  assert.equal(
    calls.find((call) => call.resource.endsWith('/adcreatives')).payload.object_story_spec.link_data
      .image_hash,
    'uploaded-hash',
  );
});

test('video launch checkpoints private uploads and cover images; processing failure cannot activate ads', async () => {
  const adapter = new LiveMetaAdapter({});
  adapter.verify = async () => ({});
  const reads = [];
  adapter.media = {
    readBytes: async (businessId, assetId, checksum) => {
      reads.push({ businessId, assetId, checksum });
      return {
        bytes: assetId === 'cover' ? png : Buffer.from('private-video-fixture'),
        asset: {
          id: assetId,
          type: assetId === 'cover' ? 'image' : 'video',
          mime: 'video/mp4',
          name: 'demo.mp4',
        },
      };
    },
  };
  const calls = [],
    checkpoints = [];
  let videoStatus = 'ready';
  adapter.request = async (integration, method, resource, payload) => {
    calls.push({ method, resource, payload });
    if (resource.endsWith('/advideos')) {
      assert.ok(payload instanceof FormData);
      assert.equal(await payload.get('source').text(), 'private-video-fixture');
      return { id: 'video-remote' };
    }
    if (resource === 'video-remote') return { status: { video_status: videoStatus } };
    if (resource.endsWith('/adimages')) return { images: { cover: { hash: 'cover-remote' } } };
    return { id: `remote-${calls.length}` };
  };
  const plan = {
    kind: 'service',
    businessId: 'tenant',
    name: 'Video lead test',
    objective: 'OUTCOME_LEADS',
    conversionEvent: 'LEAD',
    landingUrl: 'https://example.com/contact',
    budgetRecommendation: { dailyBudget: 100, totalBudget: 700, durationDays: 7 },
    audienceRecommendation: { locations: ['US'], ageMin: 18, ageMax: 65 },
    ads: [
      {
        id: 'creative',
        mediaAssetId: 'video',
        assetChecksum: 'video-digest',
        thumbnailAssetId: 'cover',
        thumbnailChecksum: 'cover-digest',
        headline: 'Real service',
        primaryText: 'Discuss your requirements',
        cta: 'CONTACT_US',
      },
    ],
  };
  const integration = { adAccountId: '123', pageId: '456', pixelId: '789' };
  await adapter.launch(plan, integration, async (...step) => checkpoints.push(step));
  const creative = calls.find((call) => call.resource.endsWith('/adcreatives')).payload
    .object_story_spec;
  assert.equal(creative.video_data.video_id, 'video-remote');
  assert.equal(creative.video_data.image_hash, 'cover-remote');
  assert.ok(
    checkpoints.some(([step, remote]) => step === 'asset:video' && remote === 'video-remote'),
  );
  assert.ok(
    checkpoints.some(([step, remote]) => step === 'asset:cover' && remote === 'cover-remote'),
  );
  assert.deepEqual(reads, [
    { businessId: 'tenant', assetId: 'video', checksum: 'video-digest' },
    { businessId: 'tenant', assetId: 'cover', checksum: 'cover-digest' },
  ]);
  calls.length = 0;
  checkpoints.length = 0;
  videoStatus = 'error';
  await assert.rejects(
    adapter.launch(plan, integration, async (...step) => checkpoints.push(step)),
    { code: 'VIDEO_PROCESSING' },
  );
  assert.ok(checkpoints.some(([step]) => step === 'asset:video'));
  assert.ok(!calls.some((call) => call.payload?.status === 'ACTIVE'));
  assert.ok(!calls.some((call) => call.resource.endsWith('/adcreatives')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { fixture, approved } from './helpers.js';
import { createApp } from '../src/app.js';
import { hash } from '../src/utils/core.js';
import {
  deletionPreview,
  deleteManagedRecord,
  cleanupDeletedMedia,
  listManagedRecords,
} from '../src/modules/records.js';
import { saveAdLibraryObservation } from '../src/modules/research/ad-library.js';
import { cachedResearch } from '../src/modules/research/cache.js';
import { z } from 'zod';

const remove = async (f, kind, id) => {
  const preview = await deletionPreview(f.platform, f.user, kind, id);
  return deleteManagedRecord(f.platform, f.user, kind, id, preview.token);
};
const saveAd = (f, extra = {}) =>
  saveAdLibraryObservation(f.platform, f.user, {
    adUrl: '123456789',
    pageName: 'Competitor shop',
    country: 'BD',
    productId: f.product.id,
    adCopy: 'Actual owner-supplied ad text.',
    observedAt: new Date().toISOString(),
    ...extra,
  });

test('deletion requires admin, origin, exact preview and workspace ownership; management listings never expose credentials', async () => {
  const f = await fixture();
  try {
    const app = createApp(f),
      agent = request.agent(app);
    await agent.get('/api/records').expect(401);
    await agent
      .post('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: f.user.email, password: 'SecureTestPassword2026!' })
      .expect(200);
    await agent
      .delete(`/api/records/products/${f.product.id}`)
      .set('Origin', 'https://evil.example')
      .send({ token: '0'.repeat(64) })
      .expect(403);
    await agent
      .delete(`/api/records/products/${f.product.id}`)
      .set('Origin', 'http://localhost:5173')
      .send({})
      .expect(422);
    await assert.rejects(
      deletionPreview(f.platform, { ...f.user, role: 'analyst' }, 'products', f.product.id),
      { status: 403 },
    );
    const other = await f.store.insert('products', {
      businessId: 'other-workspace',
      name: 'Private',
    });
    await agent.get(`/api/records/products/${other.id}/delete-preview`).expect(404);
    await agent.get(`/api/records/users/${f.user.id}/delete-preview`).expect(404);
    const integration = await f.store.insert('integrations', {
      businessId: f.user.businessId,
      provider: 'AI',
      encryptedToken: 'PRIVATE',
      encryptedKey: 'SECRET',
    });
    const rows = await listManagedRecords(f.platform, f.user, 'integrations');
    assert.equal(rows[0].id, integration.id);
    assert.doesNotMatch(JSON.stringify(rows), /PRIVATE|SECRET|encrypted/);
    const preview = (
      await agent.get(`/api/records/products/${f.product.id}/delete-preview`).expect(200)
    ).body;
    await agent
      .delete(`/api/records/products/${f.product.id}`)
      .set('Origin', 'http://localhost:5173')
      .send({ token: preview.token })
      .expect(200);
    assert.equal(await f.store.get('products', f.product.id), null);
  } finally {
    await f.close();
  }
});

test('product delete removes related plans, reports, approvals and briefs; keeps independent ads unlinked', async () => {
  const f = await fixture();
  try {
    const ad = await saveAd(f);
    const { plan, approval } = await approved(f);
    const project = await f.research.create(f.user, {
      name: 'Product validation',
      kind: 'physical-product',
      productId: f.product.id,
      description: 'A real product for validation.',
      buyerProfile: 'Bag buyers',
      candidateCountries: ['BD'],
      evidence: [],
      candidateLocationIds: [],
    });
    const version = await f.research.research(f.user, project.id);
    const secondAd = await saveAd(f, { adUrl: '223456789', projectId: project.id });
    const preview = await deletionPreview(f.platform, f.user, 'products', f.product.id);
    assert.equal(preview.blockers.length, 0);
    assert(preview.counts.some((c) => c.label === 'Campaign plans'));
    await deleteManagedRecord(f.platform, f.user, 'products', f.product.id, preview.token);
    for (const [name, id] of [
      ['campaign_plans', plan.id],
      ['approval_requests', approval.id],
      ['research_projects', project.id],
      ['research_versions', version.id],
    ])
      assert.equal(await f.store.get(name, id), null);
    assert.equal((await f.store.list('product_costs', { productId: f.product.id })).length, 0);
    for (const id of [ad.id, secondAd.id]) {
      const row = await f.store.get('ad_library_observations', id);
      assert.equal(row.productId, null);
      if (id === secondAd.id) assert.equal(row.projectId, null);
    }
    assert((await f.store.list('audit_logs')).some((row) => row.action === 'record.deleted'));
  } finally {
    await f.close();
  }
});

test('changed dependencies invalidate confirmation and failed deletion leaves the whole graph intact', async () => {
  const f = await fixture();
  try {
    const preview = await deletionPreview(f.platform, f.user, 'products', f.product.id);
    await f.platform.createPlan(f.user, f.product.id);
    await assert.rejects(
      deleteManagedRecord(f.platform, f.user, 'products', f.product.id, preview.token),
      { code: 'DELETE_CHANGED' },
    );
    const fresh = await deletionPreview(f.platform, f.user, 'products', f.product.id);
    const original = f.store.remove.bind(f.store);
    f.store.remove = async (name, id) => {
      if (name === 'campaign_plans') throw new Error('Simulated write failure');
      return original(name, id);
    };
    await assert.rejects(
      deleteManagedRecord(f.platform, f.user, 'products', f.product.id, fresh.token),
      /Simulated/,
    );
    assert(await f.store.get('products', f.product.id));
    assert.equal((await f.store.list('campaign_plans')).length, 1);
  } finally {
    await f.close();
  }
});

test('deleting a pending approval resets its retained plan; no deleted approval can launch', async () => {
  const f = await fixture();
  try {
    const plan = await f.platform.createPlan(f.user, f.product.id);
    const approval = await f.platform.submitPlan(f.user, plan.id);
    await remove(f, 'approvals', approval.id);
    assert.equal((await f.store.get('campaign_plans', plan.id)).status, 'draft');
    await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'));
    assert.equal((await f.store.list('campaigns')).length, 0);
    assert.equal((await f.platform.submitPlan(f.user, plan.id)).status, 'pending');
  } finally {
    await f.close();
  }
});

test('deleted competitor evidence is removed from selections, history, translations and cache; approved reports require review again', async () => {
  const f = await fixture();
  try {
    const ad = await saveAd(f);
    await f.store.update('products', f.product.id, { adLibraryIds: [ad.id] });
    const { plan, approval } = await approved(f),
      snapshot = hash(approval.snapshot);
    await f.store.insert('report_translations', { businessId: f.user.businessId, recordId: ad.id });
    await f.store.insert('research_cache', { businessId: f.user.businessId, requestHash: 'old' });
    const result = await remove(f, 'ad-library', ad.id);
    assert.equal(result.success, true);
    assert.equal(await f.store.get('ad_library_observations', ad.id), null);
    assert.equal((await f.store.list('ad_library_history', { observationId: ad.id })).length, 0);
    assert.deepEqual((await f.store.get('products', f.product.id)).adLibraryIds, []);
    assert.equal((await f.store.list('report_translations')).length, 0);
    assert.equal((await f.store.list('research_cache')).length, 0);
    assert.equal((await f.store.get('campaign_plans', plan.id)).status, 'needs_research');
    assert.equal((await f.store.get('approval_requests', approval.id)).status, 'superseded');
    assert.equal(hash((await f.store.get('approval_requests', approval.id)).snapshot), snapshot);
  } finally {
    await f.close();
  }
});

test('media removal detaches product images and ad screenshots; storage outages retain inaccessible cleanup work and retry succeeds', async () => {
  let fail = true;
  const removed = [];
  const f = await fixture({
    storage: {
      driver: 'local',
      remove: async (key) => {
        if (fail) throw new Error('Storage unavailable');
        removed.push(key);
      },
    },
  });
  try {
    const media = await f.store.insert('media_assets', {
      businessId: f.user.businessId,
      status: 'ready',
      storageDriver: 'local',
      storageKey: 'safe/key.png',
      name: 'Real product.png',
      size: 100,
      mime: 'image/png',
      type: 'image',
      checksum: 'test',
    });
    await f.store.update('products', f.product.id, {
      mediaAssetId: media.id,
      mediaAssetIds: [media.id],
    });
    const ad = await saveAd(f, { screenshotAssetIds: [media.id] });
    const result = await remove(f, 'media', media.id);
    assert.equal(result.cleanupPending, 1);
    assert.equal((await f.store.get('media_assets', media.id)).status, 'deleting');
    await assert.rejects(f.media.asset(f.user, media.id), { status: 404 });
    assert.equal((await f.store.get('products', f.product.id)).mediaAssetId, null);
    assert.deepEqual((await f.store.get('products', f.product.id)).mediaAssetIds, []);
    assert.deepEqual((await f.store.get('ad_library_observations', ad.id)).screenshotAssetIds, []);
    fail = false;
    assert.deepEqual(await cleanupDeletedMedia(f.platform, f.user.businessId), { pending: 0 });
    assert.deepEqual(removed, ['safe/key.png']);
    assert.equal(await f.store.get('media_assets', media.id), null);
  } finally {
    await f.close();
  }
});

test('active or uncertain executions cannot be deleted; paused campaign removal keeps budget reservations and never calls Meta', async () => {
  const f = await fixture();
  try {
    const { plan, approval } = await approved(f);
    const launched = await f.platform.executeApproved(approval.id, 'create_campaign');
    const campaigns = await f.store.list('campaigns'),
      campaign = campaigns[0];
    assert(launched);
    const preview = await deletionPreview(f.platform, f.user, 'products', f.product.id);
    assert(preview.blockers.length > 0);
    await assert.rejects(
      deleteManagedRecord(f.platform, f.user, 'products', f.product.id, preview.token),
      { code: 'DELETE_BLOCKED' },
    );
    await f.store.update('campaigns', campaign.id, { status: 'needs_reconciliation' });
    assert((await deletionPreview(f.platform, f.user, 'plans', plan.id)).blockers.length > 0);
    await f.store.update('campaigns', campaign.id, { status: 'paused' });
    f.meta.pauseCampaign = async () => {
      throw new Error('Delete must not call Meta');
    };
    await remove(f, 'plans', plan.id);
    const retained = await f.store.get('campaigns', campaign.id);
    assert.equal(retained.status, 'deleted');
    assert.equal(retained.totalBudget, campaign.totalBudget);
    assert.equal((await f.platform.overview(f.user)).campaigns.length, 0);
    assert.equal((await listManagedRecords(f.platform, f.user, 'campaigns')).length, 0);
    await assert.rejects(f.platform.owned('campaigns', campaign.id, f.user), { status: 404 });
    assert.equal((await f.store.list('ad_sets', { campaignId: campaign.id })).length, 0);
  } finally {
    await f.close();
  }
});

test('running jobs block deletion; queued tasks are cancelled durably instead of recreating deleted targets', async () => {
  const f = await fixture();
  try {
    const job = await f.store.insert('jobs', {
      businessId: f.user.businessId,
      type: 'ad-evidence-refresh',
      targetId: f.product.id,
      kind: 'product',
      status: 'running',
    });
    assert(
      (await deletionPreview(f.platform, f.user, 'products', f.product.id)).blockers.length > 0,
    );
    await f.store.update('jobs', job.id, { status: 'queued' });
    await remove(f, 'products', f.product.id);
    assert.equal((await f.store.get('jobs', job.id)).status, 'deleted');
    assert.equal((await f.platform.overview(f.user)).jobs.length, 0);
  } finally {
    await f.close();
  }
});

test('removing the current research version clears its review and retains monotonic version numbers', async () => {
  const f = await fixture();
  try {
    const project = await f.research.create(f.user, {
      name: 'Service study',
      kind: 'service',
      description: 'Custom business applications.',
      buyerProfile: 'Retail owners',
      candidateCountries: ['BD'],
      evidence: [],
      candidateLocationIds: [],
    });
    const version = await f.research.research(f.user, project.id);
    await remove(f, 'research-versions', version.id);
    const latest = await f.store.get('research_projects', project.id);
    assert.equal(latest.currentVersionId, null);
    assert.equal(latest.approvedVersionId, null);
    assert.equal(latest.status, 'draft');
    const next = await f.research.research(f.user, project.id);
    assert.equal(next.number, version.number + 1);
  } finally {
    await f.close();
  }
});

test('in-flight insight sync and cached AI output cannot recreate records after deletion', async () => {
  const f = await fixture();
  try {
    const { plan, approval } = await approved(f);
    await f.platform.executeApproved(approval.id, 'create_campaign');
    const campaign = (await f.store.list('campaigns'))[0];
    await f.store.update('campaigns', campaign.id, { status: 'paused' });
    let releaseSync, enteredSync;
    const entered = new Promise((resolve) => {
      enteredSync = resolve;
    });
    f.meta.insights = async () => {
      enteredSync();
      return new Promise((resolve) => {
        releaseSync = resolve;
      });
    };
    const sync = f.platform.syncInsights(f.user, campaign.id);
    await entered;
    await remove(f, 'plans', plan.id);
    releaseSync([]);
    await assert.rejects(sync, { status: 404 });
    assert.equal((await f.store.list('ad_performance')).length, 0);
    let releaseAI, enteredAI;
    const started = new Promise((resolve) => {
      enteredAI = resolve;
    });
    const llm = {
      config: {},
      generate: async () => {
        enteredAI();
        return new Promise((resolve) => {
          releaseAI = resolve;
        });
      },
    };
    const result = cachedResearch(
      f.platform,
      f.user,
      llm,
      'market-research',
      { name: f.product.name },
      z.object({ summary: z.string() }),
    );
    await started;
    await remove(f, 'products', f.product.id);
    releaseAI({ summary: 'A late result with deleted private inputs.' });
    await result;
    assert.equal((await f.store.list('research_cache')).length, 0);
  } finally {
    await f.close();
  }
});

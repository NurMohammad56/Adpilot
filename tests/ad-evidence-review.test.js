import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, productInput, approved } from './helpers.js';
import {
  saveAdLibraryObservation,
  archiveAdLibraryObservation,
  assertAdLibraryFresh,
} from '../src/modules/research/ad-library.js';
import {
  enqueueAdEvidenceRefresh,
  runAdEvidenceRefreshJob,
} from '../src/modules/research/ad-library-jobs.js';
import { hash } from '../src/utils/core.js';
const ad = (f, extra = {}) => ({
  adUrl: '123456789',
  pageName: 'Example competitor',
  country: 'BD',
  productId: f.product.id,
  projectId: null,
  observedAt: new Date().toISOString(),
  statusObserved: 'unknown',
  startDateObserved: '',
  adCopy: 'A real owner-supplied observation; offer equivalence is unconfirmed.',
  offer: '',
  notes: '',
  landingUrl: '',
  screenshotAssetIds: [],
  ...extra,
});

test('new linked competitor evidence supersedes approved unlaunched campaign and requires a new approval without rewriting snapshots', async () => {
  const f = await fixture();
  try {
    const { plan, approval } = await approved(f);
    const snapshotHash = hash(approval.snapshot),
      reportHash = hash(plan.research);
    await saveAdLibraryObservation(f.platform, f.user, ad(f));
    const stale = await f.store.get('campaign_plans', plan.id),
      superseded = await f.store.get('approval_requests', approval.id);
    assert.equal(stale.status, 'needs_research');
    assert.equal(superseded.status, 'superseded');
    assert.equal(hash(stale.research), reportHash);
    assert.equal(hash(superseded.snapshot), snapshotHash);
    await assert.rejects(f.platform.assertFresh(plan, f.user), { code: 'AD_RESEARCH_STALE' });
    const regenerated = await f.platform.createPlan(f.user, f.product.id);
    assert.equal(regenerated.status, 'draft');
    assert.equal(regenerated.research.adLibraryObservations.length, 1);
    const review = await f.platform.submitPlan(f.user, regenerated.id, 'manual');
    assert.equal(review.status, 'pending');
  } finally {
    await f.close();
  }
});

test('general inspiration is opt-in, works on new products and does not affect unrelated reports', async () => {
  const f = await fixture();
  try {
    const plan = await f.platform.createPlan(f.user, f.product.id);
    const general = await saveAdLibraryObservation(f.platform, f.user, ad(f, { productId: null }));
    assert.equal((await f.store.get('campaign_plans', plan.id)).status, 'draft');
    const second = await f.platform.createProduct(f.user, {
      ...productInput,
      name: 'New product with general inspiration',
      adLibraryIds: [general.id],
    });
    const generated = await f.platform.createPlan(f.user, second.id);
    assert.equal(generated.research.adLibraryObservations[0].id, general.id);
    assert.equal(
      (await f.platform.createPlan(f.user, f.product.id)).research.adLibraryObservations.length,
      0,
    );
    await archiveAdLibraryObservation(f.platform, f.user, general.id, true, general.revision);
    assert.equal((await f.store.get('campaign_plans', generated.id)).status, 'needs_research');
    await assert.rejects(
      f.platform.createProduct(f.user, { ...productInput, adLibraryIds: [general.id] }),
      { code: 'AD_ARCHIVED' },
    );
  } finally {
    await f.close();
  }
});

test('service research with selected general ads returns to review after an observation edit and retains the approved historical decision', async () => {
  const f = await fixture();
  try {
    const general = await saveAdLibraryObservation(f.platform, f.user, ad(f, { productId: null }));
    const project = await f.research.create(f.user, {
      name: 'Custom ecommerce service',
      kind: 'service',
      description: 'Custom development for retail businesses.',
      buyerProfile: 'Retail owners',
      candidateCountries: ['BD'],
      questions: '',
      evidence: [],
      adLibraryIds: [general.id],
    });
    const draft = await f.research.research(f.user, project.id);
    const edited = await f.research.edit(f.user, draft.id, {
      summary: draft.report.summary,
      recommendation: {
        ...draft.report.recommendation,
        country: 'BD',
        reason: 'Review one capped Bangladesh validation hypothesis.',
      },
      note: 'Human selects test market.',
    });
    await f.research.submit(f.user, edited.id);
    await f.research.decide(f.user, edited.id, 'approve', 'Review completed by owner.');
    const before = await f.store.get('research_versions', edited.id);
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      {
        ...ad(f, { productId: null, adCopy: 'Updated competitor offer.' }),
        expectedRevision: general.revision,
      },
      general.id,
    );
    assert.equal((await f.store.get('research_projects', project.id)).status, 'needs_research');
    const old = await f.store.get('research_versions', edited.id);
    assert(old.adLibraryInvalidatedAt);
    assert.equal(old.reportHash, before.reportHash);
    assert.equal(old.status, 'approved');
    await assert.rejects(f.research.approved(f.user, edited.id), { code: 'AD_RESEARCH_STALE' });
    const renewed = await f.research.research(f.user, project.id);
    assert.equal(renewed.status, 'draft');
    assert(!renewed.adLibraryInvalidatedAt);
    assert.equal((await f.store.get('research_projects', project.id)).approvedVersionId, null);
    assert.equal(renewed.report.adLibraryObservations[0].adCopy, 'Updated competitor offer.');
  } finally {
    await f.close();
  }
});

test('ad evidence changing during report generation rejects the report rather than approving stale sources', async () => {
  const f = await fixture();
  try {
    const row = await saveAdLibraryObservation(f.platform, f.user, ad(f));
    let changed = false;
    f.platform.llm = {
      config: { llmProvider: 'demo' },
      generate: async (task) => {
        if (task === 'bangladesh-market-research' && !changed) {
          changed = true;
          await saveAdLibraryObservation(
            f.platform,
            f.user,
            { ...ad(f, { adCopy: 'Changed while researching.' }), expectedRevision: row.revision },
            row.id,
          );
        }
        return null;
      },
    };
    await assert.rejects(f.platform.createPlan(f.user, f.product.id), {
      code: 'AD_RESEARCH_STALE',
    });
    assert.equal(
      (await f.store.list('campaign_plans', { businessId: f.user.businessId })).length,
      0,
    );
  } finally {
    await f.close();
  }
});

test('regeneration jobs deduplicate and recover their saved draft; changed queued inputs are rejected', async () => {
  const f = await fixture(),
    calls = [];
  try {
    const runtime = { ...f, jobs: { queue: { add: async (...args) => calls.push(args) } } };
    const one = await enqueueAdEvidenceRefresh(runtime, f.user, 'product', f.product.id),
      two = await enqueueAdEvidenceRefresh(runtime, f.user, 'product', f.product.id);
    assert.equal(one.job.id, two.job.id);
    assert.equal(calls.length, 1);
    const record = await f.store.get('jobs', one.job.id);
    const plan = await runAdEvidenceRefreshJob(f.platform, record);
    assert.equal(plan.status, 'draft');
    assert.equal((await runAdEvidenceRefreshJob(f.platform, record)).id, plan.id);
    await f.store.update('jobs', record.id, { status: 'completed' });
    const next = await enqueueAdEvidenceRefresh(runtime, f.user, 'product', f.product.id);
    await saveAdLibraryObservation(f.platform, f.user, ad(f));
    await assert.rejects(
      runAdEvidenceRefreshJob(f.platform, await f.store.get('jobs', next.job.id)),
      { code: 'STALE_AD_RESEARCH_JOB' },
    );
  } finally {
    await f.close();
  }
});

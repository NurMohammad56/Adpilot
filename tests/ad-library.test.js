import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { fixture } from './helpers.js';
import { createApp } from '../src/app.js';
import { LLMService } from '../src/ai/provider.js';
import {
  canonicalAdLibraryLink,
  adLibrarySearchLink,
} from '../src/modules/research/ad-library-links.js';
import {
  adLibraryObservationSchema,
  saveAdLibraryObservation,
  analyzeAdLibraryObservation,
  listAdLibraryObservations,
  archiveAdLibraryObservation,
  relatedAdLibraryObservations,
} from '../src/modules/research/ad-library.js';
import {
  enqueueAdLibraryAnalysis,
  runAdLibraryAnalysisJob,
} from '../src/modules/research/ad-library-jobs.js';

const input = (f, extra = {}) => ({
  adUrl: 'https://www.facebook.com/ads/library/?id=123456789&access_token=never-retain',
  pageName: 'Example competitor',
  country: 'BD',
  productId: f.product.id,
  projectId: null,
  observedAt: new Date().toISOString(),
  statusObserved: 'unknown',
  startDateObserved: '',
  adCopy: 'Canvas bag with an inside pocket. Delivery details available on request.',
  offer: 'Advertised price 999 BDT; not a verified comparable offer.',
  notes: '',
  landingUrl: '',
  screenshotAssetIds: [],
  ...extra,
});
const analysisReport = () => ({
  summary: 'Supplied ad copy and screenshot describe an offer; performance is unknown.',
  visibleObservations: ['An image was supplied, not retrieved from the URL.'],
  hooks: ['A practical bag'],
  offerAnalysis: 'Compare actual fabric, dimensions and delivery terms.',
  audienceHypotheses: ['Potential everyday bag users; unverified'],
  strengths: ['Product-led message'],
  weaknesses: ['Offer equivalence is unconfirmed'],
  differentiation: ['Use your own product photos and factual specifications'],
  testIdeas: ['Test one original benefit with a capped owner-approved budget.'],
  evidenceGaps: ['Delivered orders and real acquisition cost are unknown.'],
});

test('public Ad Library URLs are canonical, encoded and credential-free', () => {
  assert.equal(
    canonicalAdLibraryLink('123456789'),
    'https://www.facebook.com/ads/library/?id=123456789',
  );
  assert.equal(
    canonicalAdLibraryLink(
      'https://m.facebook.com/ads/archive/render_ad/?id=123456789&access_token=secret',
    ),
    'https://www.facebook.com/ads/library/?id=123456789',
  );
  for (const url of [
    'https://facebook.com.evil/ads/library/?id=123456789',
    'javascript:alert(1)',
    'http://www.facebook.com/ads/library/?id=123456789',
    'https://secret@www.facebook.com/ads/library/?id=123456789',
    'https://www.facebook.com/ads/library/?q=bag',
    'https://www.facebook.com/ads/library/?id=123456789&id=123456789',
  ])
    assert.equal(canonicalAdLibraryLink(url), null);
  const search = new URL(adLibrarySearchLink({ keyword: 'থ্রি পিস & bag', country: 'BD' }));
  assert.equal(search.origin, 'https://www.facebook.com');
  assert.equal(search.searchParams.get('q'), 'থ্রি পিস & bag');
  assert.equal(search.searchParams.get('active_status'), 'active');
  const page = new URL(
    adLibrarySearchLink({ keyword: 'ignored', country: 'CA', pageId: '500030636523227' }),
  );
  assert.equal(page.searchParams.get('view_all_page_id'), '500030636523227');
  assert.equal(page.searchParams.get('q'), null);
});

test('observations enforce tenant links, source dates, duplicates, stale edits and strict fields', async () => {
  const f = await fixture();
  try {
    const row = await saveAdLibraryObservation(f.platform, f.user, input(f));
    assert.equal(row.libraryAdId, '123456789');
    assert(!JSON.stringify(row).includes('never-retain'));
    assert.equal(row.analysis, null);
    assert.equal(
      adLibraryObservationSchema.safeParse(input(f, { confidence: 'High' })).success,
      false,
    );
    assert.equal(
      adLibraryObservationSchema.safeParse(input(f, { startDateObserved: '2026-13-80' })).success,
      false,
    );
    assert.equal(
      adLibraryObservationSchema.safeParse(
        input(f, { observedAt: new Date(Date.now() + 86400000).toISOString() }),
      ).success,
      false,
    );
    await assert.rejects(saveAdLibraryObservation(f.platform, f.user, input(f)), {
      code: 'AD_ALREADY_SAVED',
    });
    await assert.rejects(
      saveAdLibraryObservation(f.platform, f.user, { ...input(f), expectedRevision: 999 }, row.id),
      { code: 'STALE_AD_OBSERVATION' },
    );
    const other = await f.auth.createWorkspace(f.user, 'Other workspace');
    await assert.rejects(
      saveAdLibraryObservation(f.platform, { ...f.user, businessId: other.id }, input(f)),
      { code: 'NOT_FOUND' },
    );
    await assert.rejects(
      analyzeAdLibraryObservation(f.platform, { ...f.user, businessId: other.id }, row.id),
      { code: 'NOT_FOUND' },
    );
    await assert.rejects(
      saveAdLibraryObservation(
        f.platform,
        f.user,
        input(f, { adUrl: '234567890', startDateObserved: '2099-01-01' }),
      ),
      { code: 'AD_DATE' },
    );
  } finally {
    await f.close();
  }
});

test('bookmark-only observations cannot fabricate fetched ad content and screenshots must be owned images', async () => {
  const f = await fixture();
  try {
    const row = await saveAdLibraryObservation(
      f.platform,
      f.user,
      input(f, { adCopy: '', offer: '', notes: '' }),
    );
    await assert.rejects(analyzeAdLibraryObservation(f.platform, f.user, row.id), {
      code: 'AD_CONTENT_REQUIRED',
    });
    const video = await f.store.insert('media_assets', {
      businessId: f.user.businessId,
      status: 'ready',
      storageDriver: f.media.storage.driver,
      type: 'video',
      size: 20,
      checksum: 'a'.repeat(64),
    });
    await assert.rejects(
      saveAdLibraryObservation(
        f.platform,
        f.user,
        input(f, { adUrl: '234567890', screenshotAssetIds: [video.id] }),
      ),
      { code: 'AD_SCREENSHOT' },
    );
    const other = await f.auth.createWorkspace(f.user, 'Other images');
    const foreign = await f.store.insert('media_assets', {
      businessId: other.id,
      type: 'image',
      status: 'ready',
      storageDriver: f.media.storage.driver,
      size: 10,
    });
    await assert.rejects(
      saveAdLibraryObservation(
        f.platform,
        f.user,
        input(f, { adUrl: '234567890', screenshotAssetIds: [foreign.id] }),
      ),
      { code: 'NOT_FOUND' },
    );
  } finally {
    await f.close();
  }
});

test('AI receives real screenshot bytes at high thinking, caches identical inputs and excludes stale conclusions', async () => {
  const llm = new LLMService({
    llmProvider: 'openai',
    llmKey: 'test-only-key',
    llmModel: 'gpt-6-luna',
    researchModel: 'gpt-6-luna',
    researchThinking: 'high',
  });
  const f = await fixture({ llm }),
    original = globalThis.fetch;
  let calls = 0;
  const bytes = Buffer.from('real-test-image-bytes');
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.reasoning.effort, 'high');
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    const content = body.input[0].content;
    assert.equal(content[1].image_url, `data:image/png;base64,${bytes.toString('base64')}`);
    const prompt = JSON.parse(content[0].text);
    assert.equal(prompt.task, 'ad-library-analysis');
    assert(prompt.context.rules.includes('Do not pretend to open'));
    return new Response(
      JSON.stringify({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: JSON.stringify(analysisReport()) }],
          },
        ],
      }),
    );
  };
  try {
    const asset = await f.store.insert('media_assets', {
      businessId: f.user.businessId,
      status: 'ready',
      storageDriver: f.media.storage.driver,
      type: 'image',
      mime: 'image/png',
      size: bytes.length,
      checksum: crypto.createHash('sha256').update(bytes).digest('hex'),
      storageKey: 'test-image',
    });
    f.media.storage.bytes = async () => bytes;
    const row = await saveAdLibraryObservation(
      f.platform,
      f.user,
      input(f, { screenshotAssetIds: [asset.id] }),
    );
    const one = await analyzeAdLibraryObservation(f.platform, f.user, row.id),
      two = await analyzeAdLibraryObservation(f.platform, f.user, row.id);
    assert.equal(calls, 1);
    assert.equal(one.analysis.inputHash, two.analysis.inputHash);
    assert.equal(one.analysis.confidence, 'Low');
    assert.equal(one.analysis.demo, false);
    assert.equal(one.verifiedBy, undefined);
    assert.equal(one.quality, undefined);
    assert(!JSON.stringify(one).includes(bytes.toString('base64')));
    const sources = await relatedAdLibraryObservations(f.platform, f.user, {
      productId: f.product.id,
    });
    assert(sources[0].analysis);
    await f.store.update('products', f.product.id, { sellingPrice: 1700 });
    assert.equal(
      (await listAdLibraryObservations(f.platform, f.user)).observations[0].analysisStale,
      true,
    );
    assert.equal(
      (await relatedAdLibraryObservations(f.platform, f.user, { productId: f.product.id }))[0]
        .analysis,
      null,
    );
    await analyzeAdLibraryObservation(f.platform, f.user, row.id);
    assert.equal(calls, 2);
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      {
        ...input(f, { screenshotAssetIds: [asset.id], adCopy: 'Changed competitor offer.' }),
        expectedRevision: row.revision,
      },
      row.id,
    );
    assert.equal(
      (await listAdLibraryObservations(f.platform, f.user)).observations[0].analysisStale,
      true,
    );
  } finally {
    globalThis.fetch = original;
    await f.close();
  }
});

test('saved ads feed product and research-brief context without inventing prices or confidence; archives preserve earlier reports', async () => {
  const contexts = [],
    llm = {
      config: { llmProvider: 'demo' },
      generate: async (task, context) => {
        contexts.push({ task, context });
        return null;
      },
    };
  const f = await fixture({ llm });
  try {
    const project = await f.research.create(f.user, {
      name: 'Bag research',
      kind: 'physical-product',
      productId: f.product.id,
      description: 'Actual bag specifications need comparison.',
      buyerProfile: 'Everyday bag buyers',
      candidateCountries: ['BD'],
      evidence: [],
      questions: '',
    });
    const row = await saveAdLibraryObservation(
      f.platform,
      f.user,
      input(f, { productId: null, projectId: project.id }),
    );
    assert.equal(row.productId, f.product.id);
    await analyzeAdLibraryObservation(f.platform, f.user, row.id);
    const plan = await f.platform.createPlan(f.user, f.product.id);
    assert.equal(plan.research.adLibraryObservations[0].id, row.id);
    assert.equal(plan.research.sourcedPrices.length, 0);
    assert.equal(plan.research.confidence, 'Low');
    const research = await f.research.research(f.user, project.id);
    assert.equal(research.report.adLibraryObservations[0].id, row.id);
    assert(
      contexts.find((c) => c.task === 'market-comparison').context.adLibraryObservations.length,
    );
    assert(
      contexts.find((c) => c.task === 'bangladesh-market-research').context.adLibraryObservations
        .length,
    );
    await archiveAdLibraryObservation(f.platform, f.user, row.id, true, row.revision);
    assert.deepEqual(
      await relatedAdLibraryObservations(f.platform, f.user, { productId: f.product.id }),
      [],
    );
    assert.equal(
      (await f.store.get('campaign_plans', plan.id)).research.adLibraryObservations[0].id,
      row.id,
    );
    await assert.rejects(analyzeAdLibraryObservation(f.platform, f.user, row.id), {
      code: 'AD_ARCHIVED',
    });
  } finally {
    await f.close();
  }
});

test('analysis jobs deduplicate, bind saved snapshots and recover saved results without another model call', async () => {
  const f = await fixture(),
    calls = [];
  try {
    const runtime = { ...f, jobs: { queue: { add: async (...args) => calls.push(args) } } };
    const row = await saveAdLibraryObservation(f.platform, f.user, input(f));
    const first = await enqueueAdLibraryAnalysis(runtime, f.user, row.id),
      repeated = await enqueueAdLibraryAnalysis(runtime, f.user, row.id);
    assert.equal(first.job.id, repeated.job.id);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].attempts, 1);
    assert.equal(first.job.inputHash, undefined);
    const stored = await f.store.get('jobs', first.job.id);
    const one = await runAdLibraryAnalysisJob(f.platform, stored),
      two = await runAdLibraryAnalysisJob(f.platform, stored);
    assert.equal(one.analysis.inputHash, two.analysis.inputHash);
    assert.equal((await enqueueAdLibraryAnalysis(runtime, f.user, row.id)).queued, false);
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      { ...input(f, { adCopy: 'The offer has changed.' }), expectedRevision: row.revision },
      row.id,
    );
    await assert.rejects(runAdLibraryAnalysisJob(f.platform, stored), {
      code: 'STALE_AD_ANALYSIS',
    });
  } finally {
    await f.close();
  }
});

test('Ad Library API requires auth and isolates observations after switching workspaces', async () => {
  const f = await fixture();
  try {
    const app = createApp(f),
      agent = request.agent(app),
      origin = 'http://localhost:5173';
    await agent.get('/api/ad-library').expect(401);
    await agent
      .post('/api/auth/login')
      .set('Origin', origin)
      .send({ email: f.user.email, password: 'SecureTestPassword2026!' })
      .expect(200);
    const saved = await agent
      .post('/api/ad-library')
      .set('Origin', origin)
      .send(input(f))
      .expect(201);
    await agent
      .post(`/api/ad-library/${saved.body.id}/analyze`)
      .set('Origin', origin)
      .send({})
      .expect(200);
    const other = await f.auth.createWorkspace(f.user, 'Other API workspace');
    await agent
      .post('/api/workspaces/switch')
      .set('Origin', origin)
      .send({ businessId: other.id })
      .expect(200);
    assert.equal((await agent.get('/api/ad-library').expect(200)).body.observations.length, 0);
    await agent
      .post(`/api/ad-library/${saved.body.id}/analyze`)
      .set('Origin', origin)
      .send({})
      .expect(404);
    await agent
      .post('/api/ad-library')
      .set('Origin', origin)
      .send(input(f, { country: 'BAD' }))
      .expect(422);
  } finally {
    await f.close();
  }
});

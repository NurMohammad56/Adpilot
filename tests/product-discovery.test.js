import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import {
  discoveryInput,
  generateDiscovery,
  enqueueDiscovery,
  runDiscoveryJob,
  normalizeDiscovery,
  createDiscoveryBrief,
  listDiscoveries,
} from '../src/modules/research/product-discovery.js';
import {
  getTrendSignals,
  parseTrendRSS,
  sampledSectorCoverage,
} from '../src/modules/research/trend-sources.js';
import { trendLinks } from '../src/modules/research/trend-links.js';
import {
  saveAdLibraryObservation,
  adLibraryObservationSchema,
} from '../src/modules/research/ad-library.js';
import { LLMService } from '../src/ai/provider.js';
import { OpenAIProvider } from '../src/ai/openai.js';

test('trend sources preserve market/keyword, parse actual feed and report outages without fabricated measurements', async () => {
  const keyword = 'dress & silk';
  const link = trendLinks('BD', keyword).find((item) => item.name === 'Meta Ad Library');
  assert.equal(new URL(link.url).searchParams.get('q'), keyword);
  assert.equal(new URL(link.url).searchParams.get('country'), 'BD');
  assert.throws(() => trendLinks('http://localhost'));
  const xml =
    '<rss><channel><item><title><![CDATA[ত্বক &amp; care]]></title><ht:approx_traffic>1K+</ht:approx_traffic><pubDate>Tue, 13 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>';
  assert.equal(parseTrendRSS(xml)[0].query, 'ত্বক & care');
  const signals = await getTrendSignals('BD', async (url) => {
    assert.equal(new URL(url).hostname, 'trends.google.com');
    return new Response(xml);
  });
  assert.equal(signals.status, 'available');
  assert.equal(signals.kind, 'search-surges');
  assert.equal(signals.signals[0].searchVolumeLabel, '1K+');
  const down = await getTrendSignals('BD', async () => new Response('', { status: 429 }));
  assert.equal(down.status, 'unavailable');
  assert.deepEqual(down.signals, []);
});
test('discovery removes invented references and distinguishes supplied observations from confirmed profitability', () => {
  const source = 'https://shop.example/actual';
  const candidate = {
    name: 'Bag',
    keywords: ['bag'],
    trendEvidence: [
      { source, finding: 'Source-backed observation', dataDate: 'undated' },
      { source: 'https://fake.example', finding: 'Fake trend', dataDate: 'today' },
    ],
    competitors: [{ source: 'https://fake.example', name: 'Invented shop' }],
    risks: ['Unknown buyer demand'],
  };
  const result = normalizeDiscovery({
    candidates: [candidate],
    country: 'BD',
    retrieval: { sources: [{ source, cited: true }] },
  });
  assert.equal(result.candidates[0].trendEvidence.length, 1);
  assert.equal(result.candidates[0].competitors.length, 0);
  assert.equal(result.candidates[0].confidence, 'Low');
  assert.equal(result.candidates[0].evidenceStatus, 'source-backed hypothesis');
  assert.equal(result.candidates[0].sourceCount, 1);
  assert(result.candidates[0].evidenceGaps.some((gap) => gap.includes('profitability')));
});
test('demo discovery caches identical inputs, owns reports and hands off a candidate to one reviewable brief without creating inventory or ads', async () => {
  const f = await fixture();
  try {
    const input = discoveryInput.parse({ keywords: 'Storage bag' });
    const first = await enqueueDiscovery(f, f.user, input),
      second = await enqueueDiscovery(f, f.user, input);
    assert.equal(second.report.id, first.report.id);
    assert.equal(second.cached, true);
    assert.equal(first.report.demo, true);
    assert.equal(first.report.report.trendSignals.status, 'demo');
    const candidate = first.report.report.candidates[0];
    const brief = await createDiscoveryBrief(f.platform, f.user, first.report.id, candidate.id);
    const duplicate = await createDiscoveryBrief(f.platform, f.user, first.report.id, candidate.id);
    assert.equal(brief.id, duplicate.id);
    assert.equal(brief.status, 'draft');
    assert.equal(brief.productId, null);
    assert.equal(brief.discoveryReportId, first.report.id);
    const version = await f.research.research(f.user, brief.id);
    assert.equal(version.status, 'draft');
    assert.equal((await f.store.list('products', { businessId: f.user.businessId })).length, 1);
    assert.equal((await f.store.list('campaigns')).length, 0);
    await assert.rejects(
      f.platform.owned('product_discoveries', first.report.id, {
        ...f.user,
        businessId: 'another-workspace',
      }),
      { code: 'NOT_FOUND' },
    );
  } finally {
    await f.close();
  }
});
test('queued discovery deduplicates, recovers saved results and refuses stale selected ad evidence', async () => {
  const f = await fixture();
  try {
    let added = 0;
    const runtime = { ...f, jobs: { queue: { add: async () => added++ } } };
    const ad = await saveAdLibraryObservation(f.platform, f.user, {
      adUrl: '123455667',
      pageName: 'Bag seller',
      country: 'BD',
      observedAt: new Date().toISOString(),
      adCopy: 'Bag with useful pockets.',
    });
    const input = discoveryInput.parse({ adLibraryIds: [ad.id] });
    const first = await enqueueDiscovery(runtime, f.user, input),
      second = await enqueueDiscovery(runtime, f.user, input);
    assert.equal(first.job.id, second.job.id);
    assert.equal(added, 1);
    assert.equal(first.job.inputHash, undefined);
    const record = await f.store.get('jobs', first.job.id);
    const generated = await runDiscoveryJob(f.platform, record);
    assert.equal((await runDiscoveryJob(f.platform, record)).id, generated.id);
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      {
        ...Object.fromEntries(
          Object.keys(adLibraryObservationSchema.shape).map((key) => [key, ad[key]]),
        ),
        adCopy: 'Changed offer',
        expectedRevision: ad.revision,
      },
      ad.id,
    );
    await assert.rejects(
      createDiscoveryBrief(f.platform, f.user, generated.id, generated.report.candidates[0].id),
      { code: 'AD_RESEARCH_STALE' },
    );
    const stale = { ...record, id: 'different-job-id' };
    await assert.rejects(runDiscoveryJob(f.platform, stale), { code: 'STALE_DISCOVERY' });
  } finally {
    await f.close();
  }
});
test('sample coverage is computed from saved examples, not a fabricated market ranking', () => {
  const rows = sampledSectorCoverage([
    { adCopy: 'Kitchen storage', statusObserved: 'active', analysis: {} },
    { adCopy: 'Bag with pockets', statusObserved: 'unknown', analysisStale: true, analysis: {} },
  ]);
  assert.equal(rows.find((row) => row.name === 'Home & kitchen').savedAds, 1);
  assert.equal(rows.find((row) => row.name === 'Accessories').analyzed, 0);
  assert.equal(
    rows.reduce((sum, row) => sum + row.observedActive, 0),
    1,
  );
});
test('discovery task chooses saved research model with high thinking', async () => {
  const previous = OpenAIProvider.prototype.generate;
  try {
    OpenAIProvider.prototype.generate = async function (task) {
      assert.equal(task, 'product-discovery');
      assert.equal(this.config.llmModel, 'research-model');
      assert.equal(this.config.thinkingLevel, 'high');
      return { ok: true };
    };
    const llm = new LLMService({
      llmProvider: 'openai',
      llmModel: 'cheap-model',
      researchModel: 'research-model',
      researchThinking: 'high',
    });
    assert.deepEqual(await llm.generate('product-discovery', {}, {}), { ok: true });
  } finally {
    OpenAIProvider.prototype.generate = previous;
  }
});

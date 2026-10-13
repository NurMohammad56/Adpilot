import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { fixture } from './helpers.js';
import { cachedResearch } from '../src/modules/research/cache.js';
import { marketEvidence, comparableAdPrices } from '../src/modules/research/market-evidence.js';
import {
  saveAdLibraryObservation,
  relatedAdLibraryObservations,
} from '../src/modules/research/ad-library.js';
import { searchStrategy } from '../src/modules/research/search-strategy.js';
import { searchMetaLibrary } from '../src/modules/research/meta-library.js';
import { seal } from '../src/utils/core.js';
import { parseCopiedAd } from '../src/modules/research/ad-capture.js';

const observation = (f, id, extra = {}) => ({
  adUrl: id,
  pageName: `Advertiser ${id}`,
  country: 'BD',
  productId: f.product.id,
  observedAt: new Date().toISOString(),
  adCopy: 'Earbuds with microphone, explicitly observed ad copy.',
  advertisedPrice: 999,
  priceCurrency: 'BDT',
  priceBasis: 'unit',
  comparability: 'comparable',
  ...extra,
});

test('quick capture reads explicit IDs and Bangla prices, redacts credentials and leaves ambiguous ranges/currencies/advertisers unknown', () => {
  const parsed = parseCopiedAd(
    'Advertiser: Actual seller\nLibrary ID: ১২৩৪৫৬৭৮৯\nPage ID: ৯৮৭৬৫৪৩২১\nStatus: active\nStart date: 2026-10-01\nদাম ১,৪৯৯ টাকা\nhttps://www.facebook.com/ads/library/?id=123456789&access_token=secret-do-not-retain',
  );
  assert.equal(parsed.pageName, 'Actual seller');
  assert.equal(parsed.pageId, '987654321');
  assert.equal(parsed.startDateObserved, '2026-10-01');
  assert.equal(parsed.priceCandidates[0].amount, 1499);
  assert.equal(parsed.priceCandidates[0].currency, 'BDT');
  assert(!parsed.adCopy.includes('secret-do-not-retain'));
  assert(!parsed.adUrl.includes('access_token'));
  assert.equal(parseCopiedAd('Earbuds for active lifestyles. ৳999–1200').priceCandidates.length, 0);
  assert.equal(parseCopiedAd('Earbuds $1499').priceCandidates.length, 0);
  assert.equal(parseCopiedAd('EUR 1.499,23').priceCandidates.length, 0);
  const ambiguous = parseCopiedAd('Was BDT 1499, now BDT 999');
  assert.equal(ambiguous.priceCandidates.length, 2);
  assert.equal(ambiguous.pageName, '');
  assert.equal(ambiguous.statusObserved, 'unknown');
});

test('paid research cache reuses matching evidence, merges concurrent calls and isolates tenants/model/settings/freshness', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    const schema = z.object({ summary: z.string() }).strict();
    const llm = {
      config: {
        llmProvider: 'openai',
        researchModel: 'model-a',
        researchThinking: 'high',
        llmKey: 'private-api-key-never-store',
      },
      async generate() {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { summary: `Call ${calls}` };
      },
    };
    const run = (user = f.user, context = { evidence: 'a' }, options = {}) =>
      cachedResearch(f.platform, user, llm, 'research', context, schema, options);
    const [first, parallel] = await Promise.all([run(), run()]);
    assert.equal(calls, 1);
    assert.deepEqual(first.output, parallel.output);
    assert.equal((await run()).reuse.cached, true);
    assert.equal(calls, 1);
    const other = await f.auth.createWorkspace(f.user, 'Other cache tenant');
    await run({ ...f.user, businessId: other.id });
    assert.equal(calls, 2);
    await run(f.user, { evidence: 'changed' });
    assert.equal(calls, 3);
    llm.config.researchThinking = 'low';
    await run();
    assert.equal(calls, 4);
    llm.config.researchModel = 'model-b';
    await run();
    assert.equal(calls, 5);
    await run(f.user, { evidence: 'a' }, { fresh: true });
    assert.equal(calls, 6);
    const cache = (await f.store.list('research_cache', { businessId: f.user.businessId })).at(-1);
    await f.store.update('research_cache', cache.id, { expiresAt: new Date(0).toISOString() });
    await run();
    assert.equal(calls, 7);
    assert(!JSON.stringify(await f.store.list('research_cache')).includes(llm.config.llmKey));
    await assert.rejects(
      cachedResearch(
        f.platform,
        f.user,
        {
          ...llm,
          async generate() {
            return { wrong: 'shape' };
          },
        },
        'invalid',
        {},
        schema,
      ),
    );
    assert.equal((await f.store.list('research_cache', { task: 'invalid' })).length, 0);
  } finally {
    await f.close();
  }
});

test('price history retains revisions while fresh comparable unit quotes exclude bundles, other currencies/countries and stale samples', async () => {
  const f = await fixture();
  try {
    const first = await saveAdLibraryObservation(
      f.platform,
      f.user,
      observation(f, '778899001', { pageId: '555550001', pageName: 'Same advertiser' }),
    );
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      observation(f, '778899002', {
        pageId: '555550001',
        pageName: 'Same advertiser alias',
        advertisedPrice: 1100,
      }),
    );
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      observation(f, '778899003', { advertisedPrice: 1300 }),
    );
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      observation(f, '778899004', { advertisedPrice: 100, priceBasis: 'bundle' }),
    );
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      observation(f, '778899005', { advertisedPrice: 10, priceCurrency: 'USD' }),
    );
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      observation(f, '778899006', { advertisedPrice: 5, country: 'US' }),
    );
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      observation(f, '778899007', {
        advertisedPrice: 50,
        observedAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      }),
    );
    await saveAdLibraryObservation(
      f.platform,
      f.user,
      observation(f, '778899008', { advertisedPrice: 1, comparability: 'unknown' }),
    );
    const updated = await saveAdLibraryObservation(
      f.platform,
      f.user,
      {
        ...observation(f, '778899001', {
          pageId: '555550001',
          pageName: 'Same advertiser',
          advertisedPrice: 1200,
        }),
        expectedRevision: first.revision,
      },
      first.id,
    );
    const history = await f.store.list('ad_library_history', {
      businessId: f.user.businessId,
      observationId: first.id,
    });
    assert.deepEqual(
      history.map((r) => r.facts.advertisedPrice),
      [999, 1200],
    );
    await assert.rejects(
      saveAdLibraryObservation(
        f.platform,
        f.user,
        { ...observation(f, '778899001'), expectedRevision: first.revision },
        first.id,
      ),
      { code: 'STALE_AD_OBSERVATION' },
    );
    assert.equal((await f.store.list('ad_library_history', { observationId: first.id })).length, 2);
    const sample = await marketEvidence(f.platform, f.user, {
      productId: f.product.id,
      country: 'BD',
    });
    const bdt = sample.comparablePriceRanges.find((p) => p.currency === 'BDT');
    assert.equal(bdt.samples, 2);
    assert.equal(bdt.min, 1200);
    assert.equal(bdt.median, 1250);
    assert.equal(bdt.max, 1300);
    assert.equal(sample.staleAds, 1);
    assert.deepEqual(
      comparableAdPrices(
        await relatedAdLibraryObservations(f.platform, f.user, { productId: f.product.id }),
      ).sort((a, b) => a - b),
      [1200, 1300],
    );
    assert.equal(
      (await marketEvidence(f.platform, f.user, { country: 'BD' })).comparablePriceRanges.length,
      0,
    );
    const other = await f.auth.createWorkspace(f.user, 'Other evidence tenant');
    assert.equal(
      (await marketEvidence(f.platform, { ...f.user, businessId: other.id })).sampledAds,
      0,
    );
    await assert.rejects(
      marketEvidence(f.platform, { ...f.user, businessId: other.id }, { productId: f.product.id }),
      { code: 'NOT_FOUND' },
    );
    assert.equal(updated.revision, 2);
  } finally {
    await f.close();
  }
});

test('keyword expansion returns real search links and observed advertisers, never fabricated search results', async () => {
  const f = await fixture();
  try {
    const saved = await saveAdLibraryObservation(
      f.platform,
      f.user,
      observation(f, '778899009', { pageId: '555550099', pageName: 'Observed seller' }),
    );
    const result = await searchStrategy(f.platform, f.user, {
      keyword: 'Bluetooth Earbuds',
      country: 'BD',
      productId: f.product.id,
    });
    assert(result.searches.some((row) => row.keyword === 'TWS earbuds'));
    assert(result.searches.some((row) => row.keyword === 'ব্লুটুথ ইয়ারবাডস'));
    assert.equal(result.advertiserSearches.length, 1);
    assert.equal(result.advertiserSearches[0].pageId, saved.pageId);
    assert.equal(
      new URL(result.advertiserSearches[0].url).searchParams.get('view_all_page_id'),
      saved.pageId,
    );
    assert.equal(result.collectionMode, 'public-search-and-save');
    assert(!('foundAds' in result));
    const other = await f.auth.createWorkspace(f.user, 'Keyword tenant');
    assert.equal(
      (
        await searchStrategy(
          f.platform,
          { ...f.user, businessId: other.id },
          { keyword: 'Earbuds', country: 'BD' },
        )
      ).advertiserSearches.length,
      0,
    );
  } finally {
    await f.close();
  }
});

test('new product campaign drafts reuse the market analysis while keeping plan IDs/approval state separate and invalidate when offer/evidence changes', async () => {
  const f = await fixture();
  try {
    let marketCalls = 0;
    f.platform.llm.generate = async (task) =>
      task === 'bangladesh-market-research'
        ? (++marketCalls,
          {
            summary: 'An evidence-limited local test.',
            findings: [],
            competitorAnalysis: 'No confirmed demand.',
            differentiation: ['Validate delivery and buyer needs'],
            risks: ['Missing real conversions'],
          })
        : null;
    const first = await f.platform.createPlan(f.user, f.product.id),
      second = await f.platform.createPlan(f.user, f.product.id);
    assert.equal(marketCalls, 1);
    assert.notEqual(first.id, second.id);
    assert.equal(second.research.researchReuse.cached, true);
    assert.equal(second.status, 'draft');
    assert.equal((await f.store.list('approval_requests')).length, 0);
    await saveAdLibraryObservation(f.platform, f.user, observation(f, '123454321'));
    const changed = await f.platform.createPlan(f.user, f.product.id);
    assert.equal(marketCalls, 2);
    assert.equal(changed.research.marketEvidence.sampledAds, 1);
    assert.equal(changed.research.sourcedPrices[0], 999);
    await f.platform.createPlan(f.user, f.product.id, { freshResearch: true });
    assert.equal(marketCalls, 3);
  } finally {
    await f.close();
  }
});

test('official Meta search blocks BD before any network call, caches supported searches and never leaks paging credentials', async () => {
  const f = await fixture();
  try {
    let calls = 0;
    f.platform.config.mode = 'live';
    const token = 'EAANeverExposeThisSecretToken1234567890';
    await f.store.insert('integrations', {
      businessId: f.user.businessId,
      provider: 'META',
      encryptedToken: seal(token, f.config.encryptionKey),
    });
    f.platform.meta = {
      async request(integration, method, path, payload) {
        calls++;
        assert.equal(method, 'GET');
        assert.equal(path, 'ads_archive');
        assert.equal(payload.limit, 25);
        return {
          data: [
            {
              id: '123456789',
              page_name: 'Real API seller',
              page_id: '556677889',
              ad_creative_bodies: ['Actual returned ad copy'],
              ad_delivery_start_time: '2026-10-01T00:00:00Z',
            },
          ],
          paging: { next: `https://graph.facebook.com/next?access_token=${token}` },
        };
      },
    };
    await assert.rejects(
      searchMetaLibrary(f.platform, f.user, { country: 'BD', keyword: 'Earbuds' }),
      { code: 'AD_ARCHIVE_COVERAGE' },
    );
    assert.equal(calls, 0);
    const first = await searchMetaLibrary(f.platform, f.user, {
      country: 'DE',
      keyword: 'Earbuds',
    });
    assert.equal(first.items.length, 1);
    assert(first.hasMore);
    assert(!JSON.stringify(first).includes(token));
    assert(
      (await searchMetaLibrary(f.platform, f.user, { country: 'DE', keyword: 'Earbuds' })).reuse
        .cached,
    );
    assert.equal(calls, 1);
    await searchMetaLibrary(f.platform, f.user, { country: 'DE', keyword: 'Earbuds', fresh: true });
    assert.equal(calls, 2);
  } finally {
    await f.close();
  }
});

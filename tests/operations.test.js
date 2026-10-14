import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { fixture } from './helpers.js';
import { healthStatus } from '../src/modules/operations/health.js';
import { meteredLLM, policyOf, savePolicy, usageSummary } from '../src/modules/operations/usage.js';
import {
  enqueueResearch,
  runResearchJob,
  refreshDueProducts,
} from '../src/modules/operations/research-jobs.js';
import { encryptBackup, decryptBackup } from '../src/modules/operations/backup.js';
import { explainConfidence, evidenceAudit } from '../src/modules/research/confidence.js';

test('health detects lost database, Redis and stale worker instead of reporting healthy configuration', async () => {
  const f = await fixture();
  assert.equal((await healthStatus(f)).status, 'ok');
  const runtime = {
    ...f,
    store: {
      ping: async () => {
        throw new Error('lost');
      },
    },
    jobs: {
      connection: {
        ping: async () => {
          throw new Error('lost');
        },
        get: async () => new Date(Date.now() - 120000).toISOString(),
      },
    },
  };
  const result = await healthStatus(runtime, { worker: true });
  assert.equal(result.status, 'degraded');
  assert.equal(result.dependencies.database, 'unavailable');
  assert.equal(result.dependencies.worker, 'unavailable');
});
test('pagination isolates tenants, has stable cursor boundaries and preserves unknown revenue in compact aggregates', async () => {
  const f = await fixture();
  for (let i = 0; i < 65; i++)
    await f.store.insert('audit_logs', { businessId: f.user.businessId, action: `test-${i}` });
  await f.store.insert('audit_logs', { businessId: 'another-business', action: 'private' });
  const first = await f.store.page('audit_logs', { businessId: f.user.businessId }, { limit: 20 });
  const next = await f.store.page(
    'audit_logs',
    { businessId: f.user.businessId },
    { limit: 20, cursor: first.nextCursor },
  );
  assert.equal(first.items.length, 20);
  assert.equal(next.items.length, 20);
  assert(!next.items.some((r) => first.items.some((a) => a.id === r.id)));
  assert(!first.items.some((r) => r.action === 'private'));
  await f.store.insert('ad_performance', {
    businessId: f.user.businessId,
    level: 'campaign',
    spend: 10,
    impressions: 100,
    clicks: 5,
    conversions: 2,
    revenue: null,
  });
  const data = await f.platform.overview(f.user, { compact: true });
  assert.equal(data.metrics.revenue, null);
  assert.equal(data.metrics.conversions, 2);
  assert(data.dataPages.audit_logs.total >= 65);
});
test('AI quota reservation rejects concurrent overspending and persists actual provider tokens without changing the model', async () => {
  const f = await fixture();
  f.platform.config.mode = 'live';
  await savePolicy(f.platform, f.user, { dailyRequests: 1, monthlyTokens: 2000000 });
  const original = global.fetch;
  let count = 0;
  global.fetch = async (url, options) => {
    count++;
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-6-luna');
    assert.equal(body.store, false);
    await new Promise((resolve) => setTimeout(resolve, 25));
    return new Response(
      JSON.stringify({
        status: 'completed',
        usage: {
          input_tokens: 100,
          output_tokens: 200,
          total_tokens: 300,
          output_tokens_details: { reasoning_tokens: 50 },
        },
        output: [{ type: 'message', content: [{ type: 'output_text', text: '{"ok":true}' }] }],
      }),
      { status: 200 },
    );
  };
  try {
    const llm = meteredLLM(f.platform, f.user.businessId, {
      config: { llmProvider: 'openai', llmKey: 'unit-test-only', llmModel: 'gpt-6-luna' },
    });
    const results = await Promise.allSettled([
      llm.generate('copy', {}, z.object({ ok: z.boolean() }).strict()),
      llm.generate('copy', {}, z.object({ ok: z.boolean() }).strict()),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.find((r) => r.status === 'rejected').reason.code, 'AI_REQUEST_LIMIT');
    assert.equal(count, 1);
    const usage = await usageSummary(f.platform, f.user);
    assert.equal(usage.totals.reportedTokens, 300);
    assert.equal(usage.totals.reasoningTokens, 50);
  } finally {
    global.fetch = original;
  }
});
test('queued research deduplicates, recovers saved plans without another report, rejects stale inputs and defaults scheduled paid research off', async () => {
  const added = [],
    f = await fixture({ jobs: { queue: { add: async (...args) => added.push(args) } } });
  const first = await enqueueResearch(f, f.user, 'product', f.product.id, {}),
    second = await enqueueResearch(f, f.user, 'product', f.product.id, {});
  assert.equal(first.job.id, second.job.id);
  assert.equal(added.length, 1);
  assert.equal(await refreshDueProducts(f), 0);
  const record = await f.store.get('jobs', first.job.id),
    plan = await runResearchJob(f.platform, record),
    again = await runResearchJob(f.platform, record);
  assert.equal(again.id, plan.id);
  await f.store.update('jobs', record.id, { status: 'completed' });
  const queued = await enqueueResearch(f, f.user, 'product', f.product.id, {});
  await f.store.update('products', f.product.id, { inventory: 99 });
  await assert.rejects(
    () =>
      runResearchJob(
        f.platform,
        f.store.data.jobs.find((r) => r.id === queued.job.id),
      ),
    { code: 'STALE_RESEARCH_JOB' },
  );
});
test('encrypted offsite archive detects tampering and round-trips database dates, media and integration key', () => {
  const key = 'ab'.repeat(32),
    snapshot = {
      collections: { users: [{ id: 'unit', created: new Date() }] },
      media: [{ key: 'x', bytes: 'YWJj' }],
      runtimeSecrets: { TOKEN_ENCRYPTION_KEY: 'cd'.repeat(32) },
    };
  const bytes = encryptBackup(snapshot, key);
  assert(!bytes.includes(Buffer.from('TOKEN_ENCRYPTION_KEY')));
  assert.deepEqual(decryptBackup(bytes, key), snapshot);
  const damaged = Buffer.from(bytes);
  damaged[damaged.length - 1] ^= 1;
  assert.throws(() => decryptBackup(damaged, key));
  assert.throws(() => decryptBackup(bytes, 'ef'.repeat(32)));
});
test('confidence separates evidence, comparability and recorded sales; evidence audit flags stale unsourced claims', () => {
  const findings = [1, 2, 3].map((i) => ({
    finding: 'Checked source claim',
    source: `https://source${i}.example/page`,
    observedAt: new Date().toISOString(),
    verifiedBy: 'owner',
    classification: 'observed',
    quality: 'Verified data',
  }));
  const details = explainConfidence({
    findings,
    actualResults: [],
    adLibraryObservations: [{ comparability: 'comparable' }],
  });
  assert.equal(details.dimensions.marketEvidence.level, 'High');
  assert.equal(details.dimensions.performance.confirmedSales, 0);
  assert.equal(details.level, 'Medium');
  const audit = evidenceAudit({
    findings: [{ finding: 'Unsourced old claim', source: 'ai-provider', observedAt: '2000-01-01' }],
    risks: ['Contrary evidence'],
    evidenceGaps: ['Demand unverified'],
  });
  assert.equal(audit.claims[0].source, null);
  assert(audit.claims[0].stale);
  assert(audit.decisionReviewTriggers.includes('Demand unverified'));
});

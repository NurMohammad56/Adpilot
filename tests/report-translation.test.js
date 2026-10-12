import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import { LLMService } from '../src/ai/provider.js';
import {
  translateStoredReport,
  reportProse,
  mergeReportTranslation,
} from '../src/modules/research/report-translation.js';
import { hash } from '../src/utils/core.js';

test('Bangla display translates prose while preserving decisions, finance, source URLs, IDs and published ad copy', async () => {
  const report = {
    summary: 'Test one offer with 300 BDT daily budget.',
    recommendation: {
      country: 'BD',
      locationIds: ['region-key'],
      reason: 'Buyer demand is not established.',
      nextSteps: ['Validate 20 delivered orders.'],
    },
    findings: [
      {
        subject: 'Demand',
        finding: 'No measured sales data.',
        source: 'https://source.example/report',
        confidence: 'Low',
        observedAt: '2026-10-12T00:00:00Z',
      },
    ],
    budgetRecommendation: {
      dailyBudget: 300,
      totalBudget: 2100,
      currency: 'BDT',
      reason: 'Seven-day cap is 2100 BDT.',
    },
    ads: [{ primaryText: 'Actual approved ad copy' }],
    status: 'approved',
    fingerprint: 'exact-original',
  };
  const entries = reportProse(report);
  assert(
    !entries.some(
      (e) =>
        e.path.includes('source') || e.path.includes('primaryText') || e.path.includes('country'),
    ),
  );
  const translated = mergeReportTranslation(
    report,
    entries,
    entries.map((e) => ({ id: e.id, text: 'বাংলা অনুবাদ: ' + e.text })),
  );
  assert.equal(translated.recommendation.country, 'BD');
  assert.deepEqual(translated.recommendation.locationIds, report.recommendation.locationIds);
  assert.equal(translated.budgetRecommendation.dailyBudget, 300);
  assert.equal(translated.findings[0].source, report.findings[0].source);
  assert.deepEqual(translated.ads, report.ads);
  assert.equal(translated.fingerprint, report.fingerprint);
  await assert.rejects(
    async () =>
      mergeReportTranslation(
        report,
        entries,
        entries.map((e) => ({ id: e.id, text: 'অনুবাদে ভুল সংখ্যা' })),
      ),
    { code: 'TRANSLATION_OUTPUT' },
  );
});

test('native low-thinking translation is cached without rerunning research or mutating the reviewed record', async () => {
  const f = await fixture({
      llm: new LLMService({ llmProvider: 'openai', llmKey: 'test-only', llmModel: 'gpt-6-luna' }),
    }),
    original = globalThis.fetch;
  let calls = 0;
  try {
    const row = await f.store.insert('research_versions', {
      businessId: f.user.businessId,
      report: {
        summary: 'Validate 20 orders with 300 BDT.',
        recommendation: {
          country: 'BD',
          reason: 'Demand unverified.',
          nextSteps: ['Check buyers.'],
        },
        findings: [],
      },
      status: 'approved',
      reportHash: 'immutable-test-hash',
    });
    const before = hash(row);
    globalThis.fetch = async (url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.equal(body.reasoning.effort, 'low');
      assert.equal(body.store, false);
      assert.equal(body.tools, undefined);
      const prompt = JSON.parse(body.input);
      assert.equal(prompt.task, 'translate-report');
      const output = {
        translations: prompt.context.entries.map((e) => ({ id: e.id, text: 'বাংলা: ' + e.text })),
      };
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(output) }] },
          ],
        }),
      );
    };
    const one = await translateStoredReport(f.platform, f.user, 'research', row.id),
      two = await translateStoredReport(f.platform, f.user, 'research', row.id);
    assert.equal(one.cached, false);
    assert.equal(two.cached, true);
    assert.equal(calls, 1);
    assert(one.report.summary.includes('বাংলা'));
    assert.equal(hash(await f.store.get('research_versions', row.id)), before);
    const other = await f.auth.createWorkspace(f.user, 'Other translator');
    await assert.rejects(
      translateStoredReport(f.platform, { ...f.user, businessId: other.id }, 'research', row.id),
      { code: 'NOT_FOUND' },
    );
  } finally {
    globalThis.fetch = original;
    await f.close();
  }
});

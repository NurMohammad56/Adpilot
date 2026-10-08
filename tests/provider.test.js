import test from 'node:test';
import assert from 'node:assert/strict';
import { LLMService, researchOutputSchema } from '../src/ai/provider.js';
import { loadConfig } from '../src/config/index.js';
import { researchProduct } from '../src/modules/research/service.js';
import { productInput } from './helpers.js';
test('production demo and incomplete live configuration are rejected', () => {
  assert.throws(() => loadConfig({ APP_MODE: 'demo', NODE_ENV: 'production' }));
  assert.throws(() => loadConfig({ APP_MODE: 'live' }));
});
test('local live planning can disable jobs, while production and paid execution require Redis', () => {
  const env = {
    APP_MODE: 'live',
    BACKGROUND_JOBS_ENABLED: 'false',
    MONGODB_URI: 'mongodb://example/bd_ads',
    TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
    MCP_SERVICE_KEY: 'b'.repeat(64),
    META_API_VERSION: 'v26.0',
    APP_ORIGIN: 'http://localhost:4000',
  };
  assert.equal(loadConfig(env).backgroundJobs, false);
  assert.throws(
    () => loadConfig({ ...env, LIVE_EXECUTION_ENABLED: 'true' }),
    /require background jobs/,
  );
  assert.throws(
    () => loadConfig({ ...env, NODE_ENV: 'production', APP_ORIGIN: 'https://example.com' }),
    /require background jobs/,
  );
  assert.throws(
    () => loadConfig({ ...env, BACKGROUND_JOBS_ENABLED: 'true' }),
    /requires MongoDB, Redis/,
  );
});
test('AI cannot certify its own research as verified evidence', async () => {
  const llm = {
    generate: async () => ({
      summary: 'Hypothesis from a provider',
      findings: [
        {
          subject: 'Demand',
          finding: 'This is not independently checked',
          source: 'https://example.com',
          observedAt: new Date().toISOString(),
          confidence: 'High',
          quality: 'Verified data',
          classification: 'observed',
        },
      ],
      competitorAnalysis: 'Unknown',
      differentiation: ['Test verified product benefits'],
      risks: ['Evidence incomplete'],
    }),
  };
  const report = await researchProduct(
    productInput,
    { deliveryRegions: ['Dhaka'] },
    [],
    [],
    llm,
    false,
  );
  assert.equal(report.findings[0].quality, 'AI-generated assumptions');
  assert.equal(report.findings[0].classification, 'ai-generated');
  assert.equal(report.findings[0].confidence, 'Low');
  assert.equal(report.regionalScores[0].score, null);
});
test('invalid provider action fields are rejected rather than reaching an action service', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        summary: 'Text',
        findings: [],
        competitorAnalysis: 'Text',
        differentiation: [],
        risks: [],
        tool_calls: [{ tool: 'create_campaign' }],
      }),
      { status: 200 },
    );
  try {
    const llm = new LLMService({ llmProvider: 'gateway', llmEndpoint: 'https://trusted.example' });
    await assert.rejects(llm.generate('bangladesh-market-research', {}, researchOutputSchema), {
      code: 'LLM_OUTPUT',
    });
  } finally {
    globalThis.fetch = previous;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { OpenAIProvider } from '../src/ai/openai.js';
import { LLMService, copyOutputSchema, researchOutputSchema } from '../src/ai/provider.js';
import { comparisonSchema, projectSchema } from '../src/modules/research/workbench.js';
import { fixture } from './helpers.js';
import { workspaceLLM } from '../src/integrations/credentials.js';
import { unseal } from '../src/utils/core.js';

const config = {
  llmProvider: 'openai',
  llmKey: 'private-openai-test-key',
  llmModel: 'gpt-6-luna',
  researchModel: 'gpt-6-luna',
  thinkingLevel: 'high',
};
const source = 'https://www.census.gov/retail/ecommerce.html';
const findings = [
  {
    subject: 'Market context',
    finding: 'Retail adoption does not establish demand for this offer.',
    source,
    observedAt: new Date().toISOString(),
    confidence: 'High',
    classification: 'observed',
    quality: 'Verified data',
    value: null,
  },
];
const productReport = () => ({
  summary: 'Market hypotheses require validation.',
  competitorAnalysis: 'Compare sourced offers with the actual service.',
  differentiation: ['Validate the supplied benefit'],
  risks: ['Demand is uncertain'],
  findings: structuredClone(findings),
});
const marketReport = (countries = ['US', 'GB'], recommended = 'US') => ({
  summary: 'Demand for outsourced development is unverified.',
  countries: countries.map((country) => ({
    country,
    opportunity: 'Interview business buyers.',
    buyerSegments: ['Retail owners'],
    competition: 'Inspect competing offers.',
    languages: ['English'],
    advantages: ['Test a specific buyer problem'],
    risks: ['Willingness to pay is unknown'],
    testApproach: 'Measure qualified leads before spending more.',
    confidence: 'Low',
  })),
  findings: structuredClone(findings),
  recommendation: {
    country: recommended,
    reason: 'A provisional validation hypothesis.',
    nextSteps: ['Interview buyers'],
  },
  openQuestions: ['What would change this recommendation?'],
});
const response = (output, { search = false } = {}) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        ...(search
          ? [{ type: 'web_search_call', status: 'completed', action: { type: 'search' } }]
          : []),
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: typeof output === 'string' ? output : JSON.stringify(output),
              annotations: search
                ? [{ type: 'url_citation', url: source, title: 'US Census retail report' }]
                : [],
            },
          ],
        },
      ],
    }),
  );
async function mockFetch(callback, run) {
  const original = globalThis.fetch;
  globalThis.fetch = callback;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('OpenAI repairs incomplete regional coverage and rejects a regional decision outside the chosen country', async () => {
  const locationId = crypto.randomUUID();
  const region = {
    locationId,
    opportunity: 'Interview local retailers',
    buyerSegments: ['Retail operators'],
    competition: 'Compare local integrators',
    barriers: ['Buyer intent unverified'],
    testApproach: 'Measure qualified enquiries',
    evidenceGaps: ['Regional sources needed'],
  };
  for (const invalid of ['missing', 'wrong-country']) {
    let calls = 0;
    await mockFetch(
      async (url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(JSON.parse(body.input).outputConstraints.properties.regions.minItems, 1);
        assert.deepEqual(
          body.text.format.schema.properties.regions.items.properties.locationId.enum,
          [locationId],
        );
        const result = marketReport();
        result.regions = ++calls === 1 && invalid === 'missing' ? [] : [region];
        result.recommendation.locationIds = [locationId];
        if (calls === 1 && invalid === 'wrong-country') result.recommendation.country = 'GB';
        return response(result);
      },
      async () => {
        const result = await new OpenAIProvider(config).generate(
          'market-comparison',
          {
            project: {
              candidateCountries: ['US', 'GB'],
              candidateLocationIds: [locationId],
              candidateLocations: [{ id: locationId, name: 'California', country: 'US' }],
            },
          },
          comparisonSchema,
        );
        assert.equal(calls, 2);
        assert.equal(result.regions[0].locationId, locationId);
        assert.equal(result.recommendation.country, 'US');
      },
    );
  }
});

test('OpenAI uses native Responses, header authentication, High research and Low copy without storing responses', async () => {
  const requests = [];
  await mockFetch(
    async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(options.headers.authorization, `Bearer ${config.llmKey}`);
      assert(!url.includes(config.llmKey));
      const body = JSON.parse(options.body);
      requests.push(body);
      assert.equal(body.store, false);
      assert.equal(body.text.format.type, 'json_schema');
      assert.equal(body.text.format.strict, true);
      assert.equal(body.text.format.schema.additionalProperties, false);
      assert.equal(body.text.format.schema.properties.retrieval, undefined);
      return response(
        body.reasoning.effort === 'high'
          ? productReport()
          : {
              ads: [
                {
                  hook: 'A useful offer',
                  primaryText: 'Contact us about your real needs.',
                  headline: 'Custom stores',
                  language: 'English',
                  concept: 'Explain the supplied offer',
                },
              ],
            },
      );
    },
    async () => {
      const llm = new LLMService(config);
      await llm.generate('bangladesh-market-research', {}, researchOutputSchema);
      await llm.generate('campaign-copy', {}, copyOutputSchema);
    },
  );
  assert.deepEqual(
    requests.map((body) => body.reasoning.effort),
    ['high', 'low'],
  );
  assert(requests.every((body) => body.model === 'gpt-6-luna'));
});

test('retrieved citations survive while forged sources and self-certified confidence are downgraded', async () => {
  await mockFetch(
    async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tools) {
        assert.equal(body.tool_choice, 'required');
        assert.equal(body.tools[0].type, 'web_search');
        return response('Census reports retail adoption, not demand for custom development.', {
          search: true,
        });
      }
      const prompt = JSON.parse(body.input);
      assert.equal(prompt.retrievalStatus, 'completed');
      const result = productReport();
      result.findings.push({
        ...result.findings[0],
        source: 'https://invented.example',
        value: 999,
      });
      return response(result);
    },
    async () => {
      const output = await new OpenAIProvider({ ...config, searchGrounding: true }).generate(
        'bangladesh-market-research',
        {},
        researchOutputSchema,
      );
      assert.equal(output.retrieval.status, 'completed');
      assert.equal(output.retrieval.sourceCount, 1);
      assert.equal(output.findings[0].source, source);
      assert.equal(output.findings[0].value, undefined);
      assert.equal(output.findings[1].source, 'ai-provider');
      assert(
        output.findings.every(
          (item) => item.quality === 'AI-generated assumptions' && item.confidence === 'Low',
        ),
      );
    },
  );
});

test('missing, repeated or substituted countries and an invalid recommendation receive one bounded repair', async () => {
  for (const bad of [
    marketReport(['US']),
    marketReport(['US', 'US']),
    marketReport(['US', 'CA']),
    marketReport(['US', 'GB'], 'CA'),
  ]) {
    let calls = 0;
    await mockFetch(
      async (url, options) => {
        const body = JSON.parse(options.body);
        assert.equal(body.model, 'gpt-6-luna');
        assert.equal(body.reasoning.effort, 'high');
        const prompt = JSON.parse(body.input);
        assert.deepEqual(prompt.context.project.candidateCountries, ['US', 'GB']);
        if (++calls === 2) assert(prompt.validationIssues.length > 0);
        return response(calls === 1 ? bad : marketReport());
      },
      async () => {
        const report = await new OpenAIProvider(config).generate(
          'market-comparison',
          { project: { candidateCountries: ['US', 'GB'] } },
          comparisonSchema,
        );
        assert.deepEqual(
          report.countries.map((item) => item.country),
          ['US', 'GB'],
        );
        assert.equal(report.recommendation.country, 'US');
        assert.equal(calls, 2);
      },
    );
  }
});

test('persistent omissions and unexpected action fields cannot become valid research', async () => {
  for (const result of [
    marketReport(['US']),
    { ...marketReport(), tool_calls: [{ name: 'create_campaign' }] },
  ]) {
    let calls = 0;
    await mockFetch(
      async () => {
        calls++;
        return response(result);
      },
      async () => {
        await assert.rejects(
          new OpenAIProvider(config).generate(
            'market-comparison',
            { project: { candidateCountries: ['US', 'GB'] } },
            comparisonSchema,
          ),
          { code: 'LLM_OUTPUT' },
        );
      },
    );
    assert.equal(calls, result.tool_calls ? 1 : 2);
  }
});

test('search outage and citation-free search explicitly mark retrieval unavailable', async () => {
  for (const searchResponse of [
    response('No useful sources.'),
    new Response(
      JSON.stringify({ error: { code: 'insufficient_quota', message: config.llmKey } }),
      { status: 429 },
    ),
  ]) {
    let calls = 0;
    await mockFetch(
      async (url, options) => {
        calls++;
        if (JSON.parse(options.body).tools) return searchResponse;
        assert.equal(JSON.parse(JSON.parse(options.body).input).retrievalStatus, 'unavailable');
        return response(productReport());
      },
      async () => {
        const output = await new OpenAIProvider({ ...config, searchGrounding: true }).generate(
          'bangladesh-market-research',
          {},
          researchOutputSchema,
        );
        assert.equal(output.retrieval.status, 'unavailable');
        assert.equal(output.retrieval.sourceCount, 0);
        assert(output.findings.some((item) => item.subject === 'Source retrieval unavailable'));
        assert(!output.findings.some((item) => item.source === source));
        assert.equal(calls, 2);
      },
    );
  }
});

test('OpenAI rejects untrusted endpoints, incomplete responses and refuses to echo secrets', async () => {
  await assert.rejects(
    new OpenAIProvider({ ...config, llmEndpoint: 'https://attacker.example/v1' }).call({}),
    { code: 'OPENAI_CONFIG' },
  );
  await mockFetch(
    async () =>
      new Response(
        JSON.stringify({
          status: 'incomplete',
          output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }],
        }),
      ),
    async () => {
      await assert.rejects(new OpenAIProvider(config).call({}), { code: 'LLM_OUTPUT' });
    },
  );
  let calls = 0;
  await mockFetch(
    async () => {
      calls++;
      return new Response(
        JSON.stringify({ error: { code: 'insufficient_quota', message: config.llmKey } }),
        { status: 429 },
      );
    },
    async () => {
      await assert.rejects(
        new OpenAIProvider(config).call({}),
        (error) =>
          error.code === 'OPENAI_REJECTED' && !JSON.stringify(error).includes(config.llmKey),
      );
    },
  );
  assert.equal(calls, 1);
});

test('temporary OpenAI overload retries the same model and effort with a bounded delay', async () => {
  let calls = 0;
  const delays = [];
  const provider = new OpenAIProvider(config);
  provider.waitBeforeRetry = async (delay) => {
    delays.push(delay);
  };
  await mockFetch(
    async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'gpt-6-luna');
      assert.equal(body.reasoning.effort, 'high');
      return ++calls < 3
        ? new Response(JSON.stringify({ error: { code: 'server_error' } }), { status: 503 })
        : response('OK');
    },
    async () => {
      assert.equal((await provider.call({ input: 'Check' })).text, 'OK');
    },
  );
  assert.deepEqual(delays, [2000, 4000]);
  assert.equal(calls, 3);
});

test('OpenAI workspace keys are encrypted, required on provider change and preserved on same-provider model updates', async () => {
  const f = await fixture();
  f.config.mode = 'live';
  f.config.encryptionKey = crypto.randomBytes(32).toString('hex');
  try {
    await mockFetch(
      async (url, options) => {
        assert.match(url, /^https:\/\/api.openai.com\/v1\/models\//);
        assert.equal(options.headers.authorization, `Bearer ${config.llmKey}`);
        return new Response(JSON.stringify({ id: 'gpt-6-luna' }));
      },
      async () => {
        const saved = await f.platform.configureAI(f.user, {
          provider: 'openai',
          apiKey: config.llmKey,
          model: 'gpt-6-luna',
          grounding: true,
        });
        assert.equal(saved.researchModel, 'gpt-6-luna');
        assert.equal(saved.apiKey, undefined);
        const row = await f.store.find('integrations', {
          businessId: f.user.businessId,
          provider: 'AI',
        });
        assert.equal(unseal(row.encryptedKey, f.config.encryptionKey), config.llmKey);
        const updated = await f.platform.configureAI(f.user, {
          provider: 'openai',
          apiKey: '',
          model: 'gpt-6-luna',
          researchModel: 'gpt-6.1-sol',
          grounding: true,
        });
        assert.equal(updated.researchModel, 'gpt-6.1-sol');
        assert.equal((await f.store.get('integrations', row.id)).encryptedKey, row.encryptedKey);
        const llm = await workspaceLLM(f.platform, f.user.businessId);
        assert.equal(llm.config.searchGrounding, true);
        assert.equal(llm.config.llmKey, config.llmKey);
        await assert.rejects(
          f.platform.configureAI(f.user, {
            provider: 'gemini',
            apiKey: '',
            model: 'gemini-3-flash-preview',
          }),
          { code: 'AI_KEY_REQUIRED' },
        );
        await assert.rejects(
          f.platform.configureAI(
            { ...f.user, businessId: crypto.randomUUID() },
            { provider: 'openai', apiKey: '', model: 'gpt-6-luna' },
          ),
          { code: 'AI_KEY_REQUIRED' },
        );
        assert(!JSON.stringify(await f.platform.overview(f.user)).includes(config.llmKey));
      },
    );
  } finally {
    await f.close();
  }
});

test('OpenAI citations and retrieval provenance persist through the real research workbench', async () => {
  const f = await fixture();
  f.config.mode = 'live';
  f.config.encryptionKey = crypto.randomBytes(32).toString('hex');
  try {
    await mockFetch(
      async (url, options) => {
        if (url.includes('/models/')) return new Response('{}');
        return JSON.parse(options.body).tools
          ? response('Dated primary evidence; buyer demand remains uncertain.', { search: true })
          : response(marketReport());
      },
      async () => {
        await f.platform.configureAI(f.user, {
          provider: 'openai',
          apiKey: config.llmKey,
          model: 'gpt-6-luna',
          grounding: true,
        });
        const project = await f.research.create(
          f.user,
          projectSchema.parse({
            name: 'Retail service',
            kind: 'service',
            description: 'Build custom ecommerce software.',
            buyerProfile: 'Established retail owners.',
            candidateCountries: ['US', 'GB'],
          }),
        );
        const initial = await f.research.research(f.user, project.id);
        const next = await f.research.research(
          f.user,
          project.id,
          'Challenge the previous conclusion.',
        );
        assert.equal(initial.report.findings[0].source, source);
        assert.equal(initial.report.retrieval.status, 'completed');
        assert.equal(next.parentId, initial.id);
        assert.equal(next.number, initial.number + 1);
        assert.equal(
          (await f.store.get('research_versions', initial.id)).reportHash,
          initial.reportHash,
        );
        assert.equal(next.report.countries[0].confidence, 'Low');
      },
    );
  } finally {
    await f.close();
  }
});

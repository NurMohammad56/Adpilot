import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { GeminiProvider } from '../src/ai/gemini.js';
import { copyOutputSchema, researchOutputSchema } from '../src/ai/provider.js';
import { LiveMetaAdapter } from '../src/integrations/meta/adapter.js';
import { seal } from '../src/utils/core.js';
import { AppError } from '../src/utils/core.js';

const config = { llmKey: 'test-secret-key', llmModel: 'gemini-2.5-flash' };
test('search outages preserve a usable research report and explicitly mark missing retrieval', async () => {
  const provider = new GeminiProvider({ ...config, geminiGrounding: true });
  let calls = 0;
  provider.call = async body => {
    calls++;
    if (body.tools) throw new AppError(503, 'GEMINI_REJECTED', 'Search quota exhausted', { httpStatus: 429 });
    const input = JSON.parse(body.contents[0].parts[0].text);
    assert.equal(input.sourceRetrievalUnavailable, true);
    return { text: JSON.stringify({ summary: 'Unverified supplied-context research', competitorAnalysis: 'Not checked', differentiation: [], risks: ['Add current sources'], findings: [] }) };
  };
  const result = await provider.generate('bangladesh-market-research', { evidence: [], competitors: [] }, researchOutputSchema);
  assert.equal(calls, 2);
  assert.equal(result.findings[0].subject, 'Source retrieval unavailable');
  assert.equal(result.findings[0].source, 'ai-provider');
  assert.equal(result.findings[0].classification, 'ai-generated');
  assert.equal(researchOutputSchema.safeParse(result).success, true);
  provider.call = async () => { throw new AppError(502, 'GEMINI_REJECTED', 'Invalid API key', { httpStatus: 403 }); };
  await assert.rejects(provider.generate('bangladesh-market-research', {}, researchOutputSchema), { code: 'GEMINI_REJECTED' });
});
const copy = {
  ads: [
    {
      hook: 'Carry your essentials',
      primaryText: 'Cotton tote bag for everyday use.',
      headline: 'Everyday tote',
      language: 'English',
      concept: 'Show the actual bag in use.',
    },
  ],
};
const response = (value, extra = {}) =>
  new Response(
    JSON.stringify({
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] }, ...extra },
      ],
    }),
  );
async function mockFetch(mock, run) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
  }
}

test('Gemini uses native structured output and authenticates without putting keys in URLs', async () => {
  await mockFetch(
    async (url, options) => {
      assert.equal(
        url,
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      );
      assert.equal(options.headers['x-goog-api-key'], config.llmKey);
      const body = JSON.parse(options.body);
      assert.equal(body.generationConfig.responseMimeType, 'application/json');
      assert.ok(body.generationConfig.responseJsonSchema.properties.ads);
      assert.equal(body.tools, undefined);
      return response(copy);
    },
    async () =>
      assert.deepEqual(
        await new GeminiProvider(config).generate('campaign-copy', {}, copyOutputSchema),
        copy,
      ),
  );
});

test('Gemini rejects untrusted endpoints, incomplete responses and unexpected action fields', async () => {
  await assert.rejects(
    new GeminiProvider({ ...config, llmEndpoint: 'https://attacker.example/v1beta' }).call({}),
    { code: 'GEMINI_CONFIG' },
  );
  await mockFetch(
    async () => response(copy, { finishReason: 'MAX_TOKENS' }),
    async () => {
      await assert.rejects(
        new GeminiProvider(config).generate('campaign-copy', {}, copyOutputSchema),
        { code: 'LLM_OUTPUT' },
      );
    },
  );
  await mockFetch(
    async () => response({ ...copy, tool_calls: [{ tool: 'create_campaign' }] }),
    async () => {
      await assert.rejects(
        new GeminiProvider(config).generate('campaign-copy', {}, copyOutputSchema),
        { code: 'LLM_OUTPUT' },
      );
    },
  );
});

test('Gemini errors never repeat provider error messages containing secrets', async () => {
  await mockFetch(
    async () =>
      new Response(
        JSON.stringify({
          error: { message: `Rejected ${config.llmKey}`, status: 'PERMISSION_DENIED' },
        }),
        { status: 403 },
      ),
    async () => {
      await assert.rejects(
        new GeminiProvider(config).generate('campaign-copy', {}, copyOutputSchema),
        (error) =>
          error.code === 'GEMINI_REJECTED' && !JSON.stringify(error).includes(config.llmKey),
      );
    },
  );
});

test('Grounded research keeps retrieved sources and downgrades invented URLs and confidence', async () => {
  let calls = 0;
  const result = {
    summary: 'Test research',
    competitorAnalysis: 'Unknown prices',
    differentiation: [],
    risks: ['Review sources'],
    findings: [
      {
        subject: 'Demand',
        finding: 'An unverified hypothesis',
        source: 'https://invented.example',
        observedAt: new Date().toISOString(),
        confidence: 'High',
        classification: 'observed',
        quality: 'Verified data',
      },
    ],
  };
  await mockFetch(
    async (url, options) => {
      calls++;
      if (calls === 1) {
        assert.ok(JSON.parse(options.body).tools[0].googleSearch);
        return response('Market context', {
          groundingMetadata: {
            groundingChunks: [
              {
                web: { uri: 'https://review.example/article', title: 'Actual retrieved reference' },
              },
            ],
          },
        });
      }
      return response(result);
    },
    async () => {
      const output = await new GeminiProvider({ ...config, geminiGrounding: true }).generate(
        'bangladesh-market-research',
        { evidence: [], competitors: [] },
        researchOutputSchema,
      );
      assert.equal(calls, 2);
      assert.equal(output.findings[0].source, 'ai-provider');
      assert.equal(output.findings[0].confidence, 'Low');
      assert.equal(output.findings[1].source, 'https://review.example/article');
      assert.ok(researchOutputSchema.safeParse(output).success);
    },
  );
});

test('Meta authenticates with a bearer token and app secret proof', async () => {
  const encryptionKey = crypto.randomBytes(32).toString('hex');
  const token = 'fake-meta-token';
  const secret = 'fake-app-secret';
  await mockFetch(
    async (url, options) => {
      assert.equal(options.headers.authorization, `Bearer ${token}`);
      assert.equal(
        url.searchParams.get('appsecret_proof'),
        crypto.createHmac('sha256', secret).update(token).digest('hex'),
      );
      assert.equal(url.searchParams.get('access_token'), null);
      assert.ok(!url.href.includes(token));
      return new Response(JSON.stringify({ id: '123' }));
    },
    async () => {
      const adapter = new LiveMetaAdapter({
        metaVersion: 'v26.0',
        encryptionKey,
        metaAppSecret: secret,
      });
      assert.deepEqual(
        await adapter.request({ encryptedToken: seal(token, encryptionKey), encryptedAppSecret: seal(secret, encryptionKey) }, 'GET', 'me', {
          fields: 'id',
        }),
        { id: '123' },
      );
    },
  );
});

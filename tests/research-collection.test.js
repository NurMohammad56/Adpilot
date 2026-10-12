import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../src/ai/openai.js';
import { researchOutputSchema } from '../src/ai/provider.js';

const urls = [
  'https://seller-a.example/outfit',
  'https://seller-b.example/outfit',
  'https://courier.example/terms',
  'https://buyers.example/interviews',
];
const report = () => ({
  summary: 'Compare the exact offers before testing demand.',
  findings: [],
  competitorAnalysis: 'Seller prices are source leads, not measured demand.',
  differentiation: [],
  risks: ['Acquisition cost is unknown'],
  competitorCandidates: [],
  evidenceGaps: ['Actual delivered purchase cost and conversion history are missing.'],
});
const candidate = (source) => ({
  name: 'Comparable seller',
  offer: 'Three-piece outfit',
  source,
  price: 1500,
  currency: 'BDT',
  priceBasis: 'Per outfit; undated page',
  comparability: 'Different fabric; compare supplier specifications.',
  deliveryTerms: 'Not confirmed',
});
function result(text, cited = [], consulted = []) {
  return new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        ...(cited.length || consulted.length
          ? [
              {
                type: 'web_search_call',
                status: 'completed',
                action: { type: 'search', sources: consulted.map((url) => ({ type: 'url', url })) },
              },
            ]
          : []),
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: typeof text === 'string' ? text : JSON.stringify(text),
              annotations: cited.map((url) => ({
                type: 'url_citation',
                url,
                title: 'Inspected offer',
              })),
            },
          ],
        },
      ],
    }),
  );
}
async function run(mock, callback) {
  const old = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = old;
  }
}
const provider = () =>
  new OpenAIProvider({
    llmKey: 'test-only-key',
    llmModel: 'gpt-6-luna',
    thinkingLevel: 'high',
    searchGrounding: true,
  });

test('thin evidence receives one bounded gap search and preserves consulted versus cited provenance', async () => {
  let searches = 0,
    structured = 0;
  await run(
    async (url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.reasoning.effort, 'high');
      assert.equal(body.store, false);
      if (body.tools) {
        searches++;
        assert.deepEqual(body.include, ['web_search_call.action.sources']);
        assert.equal(body.tools[0].search_context_size, 'high');
        assert.equal(body.max_tool_calls, searches === 1 ? 4 : 2);
        return searches === 1
          ? result(
              'One comparable outfit.',
              [urls[0]],
              [urls[0], 'https://discovery.example/unread'],
            )
          : result('Additional competitor and contrary evidence.', urls.slice(1), urls.slice(1));
      }
      structured++;
      const prompt = JSON.parse(body.input);
      assert.equal(prompt.retrievedSources.length, 5);
      const output = report();
      output.competitorCandidates = [
        candidate(urls[0]),
        candidate('https://discovery.example/unread'),
        candidate('https://fabricated.example/offer'),
      ];
      return result(output);
    },
    async () => {
      const output = await provider().generate(
        'bangladesh-market-research',
        { product: { name: 'Three-piece outfit' } },
        researchOutputSchema,
      );
      assert.equal(searches, 2);
      assert.equal(structured, 1);
      assert.equal(output.retrieval.collectionRounds, 2);
      assert.equal(output.retrieval.sourceCount, 5);
      assert.equal(output.retrieval.citedSourceCount, 4);
      assert.equal(output.retrieval.independentSourceCount, 4);
      assert.equal(output.competitorCandidates.length, 1);
      assert.equal(output.competitorCandidates[0].source, urls[0]);
      assert.equal(
        output.retrieval.sources.find((s) => s.source.includes('discovery')).cited,
        false,
      );
    },
  );
});

test('adequate cited coverage skips extra search, while follow-up outage retains original evidence', async () => {
  for (const adequate of [true, false]) {
    let searches = 0;
    await run(
      async (url, options) => {
        const body = JSON.parse(options.body);
        if (!body.tools) return result(report());
        if (++searches === 2)
          return new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), {
            status: 429,
          });
        return result('Evidence digest', adequate ? urls : [urls[0]], ['https://invalid:bad-port']);
      },
      async () => {
        const output = await provider().generate(
          'bangladesh-market-research',
          {},
          researchOutputSchema,
        );
        assert.equal(searches, adequate ? 1 : 2);
        assert.equal(output.retrieval.status, 'completed');
        assert.equal(output.retrieval.sourceCount, adequate ? 4 : 1);
        assert.equal(
          output.retrieval.sources.some((s) => s.source.includes('invalid')),
          false,
        );
      },
    );
  }
});

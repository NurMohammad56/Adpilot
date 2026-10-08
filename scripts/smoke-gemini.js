import 'dotenv/config';
import fs from 'node:fs/promises';
import { loadConfig } from '../src/config/index.js';
import { LLMService, copyOutputSchema, researchOutputSchema } from '../src/ai/provider.js';

// Explicit operator check: real provider calls, no database or advertising writes.
const llm = new LLMService(loadConfig());
const context = {
  product: {
    name: 'Cotton tote bag',
    category: 'Bags',
    description:
      'Reusable cotton tote bag for carrying everyday items. No verified price or competitor evidence supplied.',
  },
  business: { location: 'Dhaka', deliveryRegions: ['Dhaka'] },
  evidence: [],
  competitors: [],
};
const results = {};
for (const [task, schema] of [
  ['campaign-copy', copyOutputSchema],
  ['bangladesh-market-research', researchOutputSchema],
]) {
  try {
    const output = await llm.generate(task, context, schema);
    results[task] = {
      ok: true,
      ...(task === 'campaign-copy'
        ? { ads: output.ads.length, languages: output.ads.map((ad) => ad.language) }
        : {
            findings: output.findings.length,
            linkedSources: output.findings.filter((f) => f.source.startsWith('https://')).length,
          }),
    };
  } catch (error) {
    results[task] = {
      ok: false,
      code: error.code || 'PROVIDER_CHECK_FAILED',
      message: error.code ? error.message : 'Provider check failed',
      details: error.details,
    };
  }
}
await fs.mkdir('.data', { recursive: true });
await fs.writeFile(
  '.data/gemini-status.json',
  JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
);
console.log(JSON.stringify(results, null, 2));
if (Object.values(results).some((result) => !result.ok)) process.exitCode = 1;

import 'dotenv/config';
import fs from 'node:fs/promises';
import { loadConfig } from '../src/config/index.js';
import { LLMService } from '../src/ai/provider.js';
import { comparisonSchema } from '../src/modules/research/workbench.js';
const config = loadConfig();
const report = {
  checkedAt: new Date().toISOString(),
  model: config.researchModel,
  thinking: config.researchThinking,
  ok: false,
};
try {
  const result = await new LLMService({ ...config, geminiGrounding: true }).generate(
    'market-comparison',
    {
      project: {
        name: 'Custom ecommerce development',
        kind: 'service',
        description: 'Build a custom ecommerce website for established retail businesses.',
        buyerProfile: 'Retail business owners.',
        candidateCountries: ['BD', 'US'],
      },
      responseLanguage: 'Bangla',
      evidence: [],
      rules:
        'Compare BD and US exactly once. Write human-readable analysis in Bangla. No supplied performance evidence: do not invent prices, CPC, conversion rates or verified demand. Investigate buyer needs, competition, trust and sales barriers, contrary evidence and a measured validation plan.',
    },
    comparisonSchema,
  );
  Object.assign(report, {
    ok: true,
    countries: result.countries.map((item) => item.country),
    banglaAnalysis: /[\u0980-\u09FF]/.test(result.summary),
    findings: result.findings.length,
    linkedSources: result.findings.filter((item) => item.source.startsWith('https://')).length,
    retrievalUnavailable: result.findings.some(
      (item) => item.subject === 'Source retrieval unavailable',
    ),
  });
} catch (error) {
  Object.assign(report, {
    code: error.code || 'PROVIDER_CHECK_FAILED',
    status: error.details?.httpStatus,
  });
  process.exitCode = 1;
}
await fs.writeFile('.data/research-thinking-status.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

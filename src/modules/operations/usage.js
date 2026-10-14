import { z } from 'zod';
import { assert, now } from '../../utils/core.js';
import { LLMService } from '../../ai/provider.js';
import { jobScope } from './research-jobs.js';

export const policySchema = z
  .object({
    dailyRequests: z.number().int().min(1).max(1000).default(20),
    monthlyRequests: z.number().int().min(1).max(10000).default(300),
    monthlyTokens: z.number().int().min(10000).max(100000000).default(2000000),
    maxOutputTokens: z.number().int().min(2000).max(32000).default(24000),
    monthlyUsd: z.number().positive().max(10000).nullable().default(null),
    inputUsdPerMillion: z.number().finite().nonnegative().nullable().default(null),
    outputUsdPerMillion: z.number().finite().nonnegative().nullable().default(null),
    searchUsdPerCall: z.number().finite().nonnegative().nullable().default(null),
    autoRefresh: z.boolean().default(false),
    refreshHours: z.number().int().min(24).max(720).default(168),
  })
  .strict()
  .refine(
    (p) =>
      p.monthlyUsd === null ||
      [p.inputUsdPerMillion, p.outputUsdPerMillion, p.searchUsdPerCall].every((v) => v !== null),
    'Configure all provider prices before enabling the USD admission limit.',
  );
export const policyOf = (business) => policySchema.parse(business?.operationsPolicy || {});
const dayKey = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const charge = (row) =>
  row.status === 'running' || row.status === 'unknown'
    ? row.reservedTokens
    : (row.totalTokens ?? row.reservedTokens);
export function researchEstimate(task, context, policy) {
  const text = JSON.stringify(context, (key, value) =>
    /^(data|imageBytes|imageData|base64)$/.test(key) ||
    (typeof value === 'string' && value.startsWith('data:image/'))
      ? '[image]'
      : value,
  );
  const inputTokens = Math.ceil(Buffer.byteLength(text || '') / 2) + 4000;
  const calls = ['market-comparison', 'bangladesh-market-research', 'product-discovery'].includes(
    task,
  )
    ? 4
    : 2;
  const outputTokens = policy.maxOutputTokens * calls;
  const searchCalls = calls === 4 ? 8 : 0;
  const estimatedUsd =
    policy.inputUsdPerMillion === null ||
    policy.outputUsdPerMillion === null ||
    policy.searchUsdPerCall === null
      ? null
      : (inputTokens * calls * policy.inputUsdPerMillion +
          outputTokens * policy.outputUsdPerMillion) /
          1e6 +
        searchCalls * policy.searchUsdPerCall;
  return {
    inputTokens: inputTokens * calls,
    outputTokens,
    reservedTokens: inputTokens * calls + outputTokens,
    searchCalls,
    estimatedUsd,
    basis:
      'Conservative planning allowance, not provider billing. Images, retries and tool input can differ.',
  };
}
export async function usageSummary(platform, user) {
  const business = await platform.store.get('businesses', user.businessId),
    policy = policyOf(business),
    day = dayKey();
  const rows = await platform.store.monthlyUsage(user.businessId, day.slice(0, 7));
  const totals = {
    dailyRequests: rows.filter((r) => r.day === day).length,
    monthlyRequests: rows.length,
    tokens: rows.reduce((s, r) => s + charge(r), 0),
    reportedTokens: rows.reduce((s, r) => s + (r.totalTokens || 0), 0),
    reasoningTokens: rows.reduce((s, r) => s + (r.reasoningTokens || 0), 0),
    searchCalls: rows.reduce((s, r) => s + (r.searchCalls || 0), 0),
    estimatedUsd: rows.reduce((s, r) => s + (r.estimatedUsd || 0), 0),
    unknown: rows.filter((r) => r.status === 'unknown' || r.totalTokens == null).length,
  };
  return {
    policy,
    totals,
    day,
    month: day.slice(0, 7),
    recent: rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20),
    pricingNote:
      'USD values use your configured provider prices and exclude unreported charges. The provider billing dashboard is authoritative.',
  };
}
export async function savePolicy(platform, user, input) {
  assert(user.role === 'admin', 403, 'ROLE_REQUIRED', 'Administrator required');
  const policy = policySchema.parse(input);
  await platform.store.transaction(async () => {
    const business = await platform.store.get('businesses', user.businessId);
    await platform.store.update('businesses', business.id, { operationsPolicy: policy });
    await platform.audit(user, 'operations.policy_updated', business.id);
  });
  return policy;
}
export function meteredLLM(platform, businessId, base) {
  return {
    config: base.config,
    async generate(task, context, schema, options = {}) {
      if (platform.config.mode === 'demo') return base.generate(task, context, schema, options);
      const day = dayKey();
      let row, policy, estimate;
      await platform.store.transaction(async () => {
        const business = await platform.store.get('businesses', businessId);
        assert(business, 404, 'NOT_FOUND', 'Workspace unavailable');
        policy = policyOf(business);
        assert(
          !business.aiCircuitUntil || Date.parse(business.aiCircuitUntil) <= Date.now(),
          503,
          'AI_COOLDOWN',
          'AI provider is temporarily unavailable. Wait one minute; saved inputs remain available.',
        );
        const rows = await platform.store.monthlyUsage(businessId, day.slice(0, 7));
        estimate = researchEstimate(task, context, policy);
        assert(
          rows.filter((r) => r.day === day).length < policy.dailyRequests &&
            rows.length < policy.monthlyRequests,
          429,
          'AI_REQUEST_LIMIT',
          'Workspace AI request limit reached. Cached reports remain available.',
        );
        assert(
          rows.reduce((s, r) => s + charge(r), 0) + estimate.reservedTokens <= policy.monthlyTokens,
          429,
          'AI_TOKEN_LIMIT',
          'Research exceeds the remaining monthly token allowance. Review the usage policy or reuse a cached report.',
        );
        assert(
          policy.monthlyUsd === null ||
            rows.reduce((s, r) => s + (r.estimatedUsd || 0), 0) + estimate.estimatedUsd <=
              policy.monthlyUsd,
          429,
          'AI_COST_LIMIT',
          'Research exceeds the configured monthly USD planning allowance.',
        );
        await platform.store.update('businesses', businessId, {
          aiUsageVersion: (business.aiUsageVersion || 0) + 1,
        });
        row = await platform.store.insert('ai_usage', {
          businessId,
          day,
          task,
          provider: base.config.llmProvider,
          model: [
            'product-discovery',
            'bangladesh-market-research',
            'market-comparison',
            'product-image-analysis',
            'ad-library-analysis',
            'ad-search-strategy',
          ].includes(task)
            ? base.config.researchModel || base.config.llmModel
            : base.config.llmModel,
          status: 'running',
          reservedTokens: estimate.reservedTokens,
          estimatedUsd: estimate.estimatedUsd,
        });
      });
      const calls = [];
      let error, output;
      const job = jobScope.getStore();
      const llm = new LLMService({
        ...base.config,
        maxOutputTokens: policy.maxOutputTokens,
        onCheckpoint: job
          ? async (checkpoint) => {
              await platform.store.update('jobs', job.id, {
                checkpoint: { task, ...checkpoint },
                stage: 'analyzing-evidence',
                progress: 55,
              });
            }
          : undefined,
        onUsage: async (value) => {
          calls.push(value);
          await platform.store.update('ai_usage', row.id, {
            providerCalls: calls.length,
            inputTokens: calls.reduce((s, r) => s + (r.inputTokens || 0), 0),
            outputTokens: calls.reduce((s, r) => s + (r.outputTokens || 0), 0),
            totalTokens: calls.reduce((s, r) => s + (r.totalTokens || 0), 0),
            reasoningTokens: calls.reduce((s, r) => s + (r.reasoningTokens || 0), 0),
            searchCalls: calls.reduce((s, r) => s + (r.searchCalls || 0), 0),
          });
        },
      });
      try {
        output = await llm.generate(task, context, schema, {
          ...options,
          ...(job?.checkpoint?.task === task ? { retrievalCheckpoint: job.checkpoint } : {}),
        });
      } catch (e) {
        error = e;
      }
      await platform.store.transaction(async () => {
        const business = await platform.store.get('businesses', businessId);
        if (!business) return;
        const failures = error?.status >= 500 ? (business.aiFailureCount || 0) + 1 : 0;
        await platform.store.update('businesses', businessId, {
          aiFailureCount: failures,
          aiCircuitUntil: failures >= 3 ? new Date(Date.now() + 60000).toISOString() : null,
        });
        const totalTokens = calls.reduce((s, r) => s + (r.totalTokens || 0), 0);
        const actualEstimate =
          calls.length && policy.inputUsdPerMillion !== null
            ? calls.reduce(
                (s, r) =>
                  s +
                  ((r.inputTokens || 0) * policy.inputUsdPerMillion +
                    (r.outputTokens || 0) * policy.outputUsdPerMillion) /
                    1e6 +
                  (r.searchCalls || 0) * policy.searchUsdPerCall,
                0,
              )
            : estimate.estimatedUsd;
        await platform.store.update('ai_usage', row.id, {
          status: error ? 'unknown' : 'completed',
          completedAt: now(),
          errorCode: error?.code || null,
          totalTokens: calls.length ? totalTokens : null,
          estimatedUsd: error ? estimate.estimatedUsd : actualEstimate,
        });
      });
      if (error) throw error;
      return output;
    },
  };
}

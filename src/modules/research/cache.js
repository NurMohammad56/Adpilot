import { hash, now } from '../../utils/core.js';

const pending = new WeakMap();
export const RESEARCH_CACHE_VERSION = 1;
// Cache AI evidence analysis only. Approvals, economics and campaign actions are never cached.
export async function cachedResearch(
  platform,
  user,
  llm,
  task,
  context,
  schema,
  { fresh = false } = {},
) {
  const config = llm.config || {};
  const requestHash = hash({
    version: RESEARCH_CACHE_VERSION,
    task,
    context,
    provider: config.llmProvider,
    model: config.researchModel || config.llmModel,
    thinking: config.researchThinking || 'high',
    grounding: config.searchGrounding ?? config.geminiGrounding,
    credentials: config.llmKey ? hash(config.llmKey) : 'demo',
  });
  const key = `${user.businessId}:${requestHash}`;
  const valid = (row) =>
    row && Date.parse(row.expiresAt) > Date.now() && schema.safeParse(row.output).success;
  const current = await platform.store.find('research_cache', {
    businessId: user.businessId,
    requestHash,
  });
  if (!fresh && valid(current))
    return {
      output: structuredClone(current.output),
      reuse: { cached: true, generatedAt: current.generatedAt, expiresAt: current.expiresAt },
    };
  if (!pending.has(platform)) pending.set(platform, new Map());
  const running = pending.get(platform);
  if (running.has(key)) return running.get(key);
  const work = (async () => {
    const output = await llm.generate(task, context, schema);
    if (output === null) return { output, reuse: null };
    schema.parse(output);
    const generatedAt = now(),
      expiresAt = new Date(Date.now() + 12 * 3600000).toISOString();
    try {
      await platform.store.transaction(async () => {
        const existing = await platform.store.find('research_cache', {
          businessId: user.businessId,
          requestHash,
        });
        const fields = { output, task, generatedAt, expiresAt, expiresAtDate: new Date(expiresAt) };
        if (existing) await platform.store.update('research_cache', existing.id, fields);
        else
          await platform.store.insert('research_cache', {
            ...fields,
            businessId: user.businessId,
            requestHash,
          });
        const rows = (
          await platform.store.list('research_cache', { businessId: user.businessId })
        ).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
        for (const row of rows.slice(200)) await platform.store.remove('research_cache', row.id);
      });
    } catch (error) {
      if (error.code !== 11000 && error.code !== 'DUPLICATE') throw error;
      const winner = await platform.store.find('research_cache', {
        businessId: user.businessId,
        requestHash,
      });
      if (!valid(winner)) throw error;
      return {
        output: structuredClone(winner.output),
        reuse: { cached: true, generatedAt: winner.generatedAt, expiresAt: winner.expiresAt },
      };
    }
    return { output, reuse: { cached: false, generatedAt, expiresAt } };
  })();
  running.set(key, work);
  try {
    return await work;
  } finally {
    running.delete(key);
  }
}

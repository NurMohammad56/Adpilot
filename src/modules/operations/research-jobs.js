import { AsyncLocalStorage } from 'node:async_hooks';
import { assert, hash } from '../../utils/core.js';
export const jobScope = new AsyncLocalStorage();
export const publicResearchJob = ({ checkpoint, input, inputHash, requestedBy, ...row }) => row;
export async function enqueueResearch(runtime, user, kind, targetId, input = {}) {
  const target = await runtime.platform.owned(
    kind === 'research' ? 'research_projects' : 'products',
    targetId,
    user,
  );
  if (!runtime.jobs)
    return {
      queued: false,
      result:
        kind === 'research'
          ? await runtime.research.research(
              user,
              targetId,
              input.instruction || '',
              user.language || 'en',
              null,
              Boolean(input.fresh),
            )
          : await runtime.platform.createPlan(user, targetId, {
              freshResearch: Boolean(input.fresh),
            }),
    };
  let row,
    created = false;
  await runtime.store.transaction(async () => {
    const business = await runtime.store.get('businesses', user.businessId);
    await runtime.store.update('businesses', business.id, {
      jobVersion: (business.jobVersion || 0) + 1,
    });
    const pending = (
      await runtime.store.list('jobs', {
        businessId: user.businessId,
        type: 'research-task',
        kind,
        targetId,
      })
    ).find((r) => !r.deletedAt && ['queued', 'running'].includes(r.status));
    if (pending) {
      row = pending;
      return;
    }
    row = await runtime.store.insert('jobs', {
      businessId: user.businessId,
      type: 'research-task',
      kind,
      targetId,
      inputHash: hash(target),
      input,
      requestedBy: user.id,
      language: user.language || 'en',
      status: 'queued',
      stage: 'waiting',
      progress: 0,
    });
    created = true;
  });
  try {
    if (created)
      await runtime.jobs.queue.add(
        'research-task',
        { businessId: user.businessId, jobRecordId: row.id },
        { jobId: row.id, attempts: 2 },
      );
  } catch (error) {
    await runtime.store.update('jobs', row.id, {
      status: 'failed',
      errorCode: 'QUEUE_UNAVAILABLE',
      errorMessage: 'Queue unavailable. The saved brief and product are preserved.',
    });
    throw error;
  }
  return { queued: true, job: publicResearchJob(row) };
}
export async function runResearchJob(platform, record) {
  const creator = await platform.store.get('users', record.requestedBy),
    membership = await platform.store.find('workspace_memberships', {
      businessId: record.businessId,
      userId: record.requestedBy,
    });
  assert(
    creator && (creator.businessId === record.businessId || membership),
    403,
    'WORKSPACE_ACCESS',
    'The requesting user no longer has workspace access.',
  );
  const user = {
    id: creator.id,
    businessId: record.businessId,
    role: 'analyst',
    language: record.language,
  };
  const recovered = await platform.store.find(
    record.kind === 'research' ? 'research_versions' : 'campaign_plans',
    { businessId: record.businessId, adEvidenceRefreshJobId: record.id },
  );
  if (recovered) return recovered;
  const target = await platform.owned(
    record.kind === 'research' ? 'research_projects' : 'products',
    record.targetId,
    user,
  );
  assert(
    hash(target) === record.inputHash,
    409,
    'STALE_RESEARCH_JOB',
    'Inputs changed while queued. Request research using the current version.',
  );
  await platform.store.update('jobs', record.id, { stage: 'collecting-evidence', progress: 15 });
  return jobScope.run({ id: record.id, checkpoint: record.checkpoint }, async () => {
    const result =
      record.kind === 'research'
        ? await platform.research.research(
            user,
            target.id,
            record.input?.instruction || '',
            record.language,
            record.id,
            Boolean(record.input?.fresh),
          )
        : await platform.createPlan(user, target.id, {
            freshResearch: Boolean(record.input?.fresh),
            adEvidenceRefreshJobId: record.id,
          });
    await platform.store.update('jobs', record.id, {
      stage: 'saving-result',
      progress: 95,
      ...(record.kind === 'research' ? { versionId: result.id } : { planId: result.id }),
    });
    return result;
  });
}
export async function refreshDueProducts(runtime) {
  const { store } = runtime;
  const { policyOf } = await import('./usage.js');
  let scheduled = 0;
  for (const business of await store.list('businesses')) {
    const policy = policyOf(business);
    if (!policy.autoRefresh) continue;
    const creator = (await store.list('users', { businessId: business.id, role: 'admin' }))[0];
    if (!creator) continue;
    for (const product of await store.list('products', { businessId: business.id })) {
      if (product.deletedAt) continue;
      const latest = (
        await store.page(
          'campaign_plans',
          { businessId: business.id, productId: product.id },
          { limit: 1 },
        )
      ).items[0];
      if (latest && Date.now() - Date.parse(latest.createdAt) < policy.refreshHours * 3600000)
        continue;
      await enqueueResearch(
        runtime,
        { id: creator.id, businessId: business.id, role: 'analyst' },
        'product',
        product.id,
        {},
      );
      scheduled++;
      if (scheduled >= 10) return scheduled;
    }
  }
  return scheduled;
}

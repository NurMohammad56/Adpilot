import { assert, hash } from '../../utils/core.js';
import { createProductGroup, groupInput } from './product-group.js';

export async function enqueueProductGroup(runtime, user, input) {
  input = groupInput.parse(input);
  const { platform, store, jobs } = runtime;
  if (!jobs) return createProductGroup(platform, user, input);
  const snapshots = [];
  for (const id of input.productIds)
    snapshots.push({ id, hash: hash(await platform.owned('products', id, user)) });
  const requestHash = hash({ input, snapshots });
  const existing = (
    await store.list('jobs', {
      businessId: user.businessId,
      type: 'product-group-plan',
      requestHash,
    })
  ).find((row) => ['queued', 'running'].includes(row.status));
  if (existing) return existing;
  const record = await store.insert('jobs', {
    businessId: user.businessId,
    type: 'product-group-plan',
    requestedBy: user.id,
    language: user.language || 'en',
    input,
    snapshots,
    requestHash,
    status: 'queued',
  });
  try {
    // Provider calls already retry transient failures. Avoid repeating an expensive full research automatically.
    await jobs.queue.add(
      'product-group-plan',
      { jobRecordId: record.id, businessId: user.businessId },
      { jobId: record.id, attempts: 1 },
    );
  } catch (error) {
    await store.update('jobs', record.id, {
      status: 'failed',
      errorCode: 'QUEUE_UNAVAILABLE',
      errorMessage: 'Research queue is unavailable. Your products are saved.',
    });
    throw error;
  }
  return record;
}

export async function runProductGroupJob(platform, record) {
  const creator = await platform.store.get('users', record.requestedBy);
  const membership = await platform.store.find('workspace_memberships', {
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
    id: record.requestedBy,
    role: 'analyst',
    businessId: record.businessId,
    language: record.language || 'en',
  };
  const existing = await platform.store.find('campaign_plans', {
    businessId: record.businessId,
    planningJobId: record.id,
  });
  if (existing) return existing;
  for (const snapshot of record.snapshots)
    assert(
      hash(await platform.owned('products', snapshot.id, user)) === snapshot.hash,
      409,
      'STALE_JOB',
      'A selected product changed while research was queued. Create a new group request.',
    );
  return createProductGroup(platform, user, record.input, null, {
    planningJobId: record.id,
    queuedSnapshots: record.snapshots,
  });
}

import { assert, hash } from '../../utils/core.js';
import { adLibraryAnalysisInput, analyzeAdLibraryObservation } from './ad-library.js';
import { adLibrarySnapshot } from './ad-library.js';
import { briefOf } from './workbench.js';

export async function enqueueAdEvidenceRefresh(runtime, user, kind, targetId) {
  const target = await runtime.platform.owned(
    kind === 'product' ? 'products' : 'research_projects',
    targetId,
    user,
  );
  const snapshot = await adLibrarySnapshot(runtime.platform, user, {
    productIds: kind === 'product' ? [targetId] : target.productId ? [target.productId] : [],
    projectId: kind === 'research' ? targetId : null,
  });
  const inputHash = hash({
    target: kind === 'product' ? target : briefOf(target),
    evidence: snapshot.fingerprint,
  });
  if (!runtime.jobs)
    return {
      queued: false,
      kind,
      result:
        kind === 'product'
          ? await runtime.platform.createPlan(user, targetId)
          : await runtime.research.research(
              user,
              targetId,
              'Regenerate using the current linked and selected competitor ad evidence.',
              user.language || 'en',
            ),
    };
  const requestHash = hash({ kind, targetId, inputHash, language: user.language || 'en' });
  const pending = (
    await runtime.store.list('jobs', {
      businessId: user.businessId,
      type: 'ad-evidence-refresh',
      requestHash,
    })
  ).find((job) => ['queued', 'running'].includes(job.status));
  if (pending) return { queued: true, job: publicAdJob(pending) };
  const row = await runtime.store.insert('jobs', {
    businessId: user.businessId,
    type: 'ad-evidence-refresh',
    kind,
    targetId,
    inputHash,
    requestHash,
    requestedBy: user.id,
    language: user.language || 'en',
    status: 'queued',
  });
  try {
    await runtime.jobs.queue.add(
      'ad-evidence-refresh',
      { businessId: user.businessId, jobRecordId: row.id },
      { jobId: row.id, attempts: 1 },
    );
  } catch (error) {
    await runtime.store.update('jobs', row.id, {
      status: 'failed',
      errorCode: 'QUEUE_UNAVAILABLE',
      errorMessage: 'Research queue is unavailable. Your saved evidence remains available.',
    });
    throw error;
  }
  return { queued: true, job: publicAdJob(row) };
}

export async function runAdEvidenceRefreshJob(platform, record) {
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
    id: creator.id,
    businessId: record.businessId,
    role: 'analyst',
    language: record.language,
  };
  const existing = await platform.store.find(
    record.kind === 'product' ? 'campaign_plans' : 'research_versions',
    { businessId: record.businessId, adEvidenceRefreshJobId: record.id },
  );
  if (existing) return existing;
  const target = await platform.owned(
    record.kind === 'product' ? 'products' : 'research_projects',
    record.targetId,
    user,
  );
  const snapshot = await adLibrarySnapshot(platform, user, {
    productIds:
      record.kind === 'product' ? [target.id] : target.productId ? [target.productId] : [],
    projectId: record.kind === 'research' ? target.id : null,
  });
  assert(
    hash({
      target: record.kind === 'product' ? target : briefOf(target),
      evidence: snapshot.fingerprint,
    }) === record.inputHash,
    409,
    'STALE_AD_RESEARCH_JOB',
    'The offer or ad evidence changed while queued. Request fresh research again.',
  );
  return record.kind === 'product'
    ? platform.createPlan(user, target.id, { adEvidenceRefreshJobId: record.id })
    : platform.research.research(
        user,
        target.id,
        'Regenerate using the current linked and selected competitor ad evidence.',
        user.language || 'en',
        record.id,
      );
}

export async function enqueueAdLibraryAnalysis(runtime, user, observationId) {
  const input = await adLibraryAnalysisInput(runtime.platform, user, observationId);
  if (input.observation.analysis?.inputHash === input.inputHash)
    return { queued: false, observation: input.observation };
  if (!runtime.jobs)
    return {
      queued: false,
      observation: await analyzeAdLibraryObservation(
        runtime.platform,
        user,
        observationId,
        input.inputHash,
      ),
    };
  const requestHash = hash({ observationId, inputHash: input.inputHash });
  const pending = (
    await runtime.store.list('jobs', {
      businessId: user.businessId,
      type: 'ad-library-analysis',
      requestHash,
    })
  ).find((row) => ['queued', 'running'].includes(row.status));
  if (pending) return { queued: true, job: publicAdJob(pending) };
  const record = await runtime.store.insert('jobs', {
    businessId: user.businessId,
    type: 'ad-library-analysis',
    observationId,
    inputHash: input.inputHash,
    requestHash,
    requestedBy: user.id,
    language: user.language || 'en',
    status: 'queued',
  });
  try {
    await runtime.jobs.queue.add(
      'ad-library-analysis',
      { jobRecordId: record.id, businessId: user.businessId },
      { jobId: record.id, attempts: 1 },
    );
  } catch (error) {
    await runtime.store.update('jobs', record.id, {
      status: 'failed',
      errorCode: 'QUEUE_UNAVAILABLE',
      errorMessage: 'Analysis queue is unavailable. Your saved observation is safe.',
    });
    throw error;
  }
  return { queued: true, job: publicAdJob(record) };
}
const publicAdJob = ({ inputHash, requestHash, requestedBy, ...row }) => row;

export async function runAdLibraryAnalysisJob(platform, record) {
  assert(record?.type === 'ad-library-analysis', 409, 'AD_JOB', 'Invalid ad analysis job.');
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
  return analyzeAdLibraryObservation(
    platform,
    { id: creator.id, businessId: record.businessId, role: 'analyst', language: record.language },
    record.observationId,
    record.inputHash,
    record.language,
  );
}

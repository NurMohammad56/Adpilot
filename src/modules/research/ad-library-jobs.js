import { assert, hash } from '../../utils/core.js';
import { adLibraryAnalysisInput, analyzeAdLibraryObservation } from './ad-library.js';

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

import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { createRuntime } from '../runtime.js';
import { now } from '../utils/core.js';
const runtime = await createRuntime({ seed: false });
if (runtime.config.mode === 'demo' || !runtime.jobs) {
  process.stderr.write(
    'Demo jobs run in the API process. Live workers require MongoDB and Redis.\n',
  );
  await runtime.close();
  process.exit(0);
}
const { store, platform, jobs } = runtime;
const worker = new Worker(
  'adpilot-jobs',
  async (job) => {
    if (['periodic-maintenance', 'daily-maintenance'].includes(job.name)) {
      const campaigns = (await store.list('campaigns')).filter((c) =>
        ['active', 'paused'].includes(c.status),
      );
      for (const campaign of campaigns)
        await jobs.queue.add(
          'insights-sync',
          { campaignId: campaign.id, businessId: campaign.businessId },
          { jobId: `sync-${campaign.id}-${Math.floor(Date.now() / 3600000)}` },
        );
      for (const approval of await store.list('approval_requests', { status: 'pending' })) {
        if (Date.parse(approval.expiresAt) < Date.now())
          await store.transaction(async () => {
            const latest = await store.get('approval_requests', approval.id);
            if (latest.status === 'pending') {
              await store.update('approval_requests', approval.id, { status: 'expired' });
              if (approval.action === 'launch_campaign')
                await store.update('campaign_plans', approval.planId, { status: 'rejected' });
              await store.insert('audit_logs', {
                businessId: approval.businessId,
                actorId: 'system-worker',
                action: 'approval.expired',
                entityId: approval.id,
              });
            }
          });
        else if (!approval.remindedAt && Date.now() - Date.parse(approval.createdAt) > 4 * 3600000)
          await store.transaction(async () => {
            await store.update('approval_requests', approval.id, { remindedAt: now() });
            await store.insert('audit_logs', {
              businessId: approval.businessId,
              actorId: 'system-worker',
              action: 'approval.reminder',
              entityId: approval.id,
              detail: { message: 'Pending approval needs review; no external message was sent.' },
            });
          });
      }
      for (const approval of await store.list('approval_requests', { status: 'executing' })) {
        if (Date.now() - Date.parse(approval.executionStartedAt) > 10 * 60000)
          await store.transaction(async () => {
            const latest = await store.get('approval_requests', approval.id);
            if (latest.status === 'executing') {
              await store.update('approval_requests', approval.id, {
                status: 'needs_reconciliation',
                errorCode: 'STALE_EXECUTION',
              });
              await store.update('campaigns', approval.executionCampaignId, {
                status: 'needs_reconciliation',
                errorCode: 'STALE_EXECUTION',
              });
              await store.insert('audit_logs', {
                businessId: approval.businessId,
                actorId: 'system-worker',
                action: 'execution.needs_reconciliation',
                entityId: approval.id,
                detail: {
                  message:
                    'Execution exceeded the time limit; verify remote outcome before another write.',
                },
              });
            }
          });
      }
      if (job.name === 'daily-maintenance') {
        for (const product of await store.list('products'))
          await jobs.queue.add(
            'research-refresh',
            { productId: product.id, businessId: product.businessId },
            { jobId: `research-${product.id}-${new Date().toISOString().slice(0, 10)}` },
          );
        for (const business of await store.list('businesses'))
          await jobs.queue.add(
            'daily-report',
            { businessId: business.id },
            { jobId: `report-${business.id}-${new Date().toISOString().slice(0, 10)}` },
          );
      }
      return;
    }
    const record = job.data.jobRecordId && (await store.get('jobs', job.data.jobRecordId));
    if (record)
      await store.update('jobs', record.id, {
        status: 'running',
        startedAt: now(),
        attempt: job.attemptsMade + 1,
      });
    try {
      const user = { id: 'system-worker', role: 'analyst', businessId: job.data.businessId };
      if (job.name === 'insights-sync') {
        await platform.syncInsights(user, job.data.campaignId);
        await platform.analyze(user, job.data.campaignId);
      } else if (job.name === 'research-refresh')
        await platform.createPlan(user, job.data.productId);
      else if (job.name === 'daily-report') {
        const data = await platform.overview(user);
        await store.insert('audit_logs', {
          businessId: user.businessId,
          actorId: user.id,
          action: 'report.generated',
          entityId: user.businessId,
          detail: { metrics: data.metrics },
        });
      } else throw new Error('Unknown job type');
      if (record)
        await store.update('jobs', record.id, { status: 'completed', completedAt: now() });
    } catch (error) {
      if (record)
        await store.update('jobs', record.id, {
          status: 'failed',
          errorCode: error.code || 'JOB_FAILED',
        });
      throw error;
    }
  },
  {
    connection: new Redis(runtime.config.redisUrl, { maxRetriesPerRequest: null }),
    concurrency: 3,
  },
);
await jobs.queue.upsertJobScheduler(
  'hourly-maintenance',
  { every: 3600000 },
  { name: 'periodic-maintenance', data: {} },
);
await jobs.queue.upsertJobScheduler(
  'daily-research',
  { pattern: '0 7 * * *', tz: 'Asia/Dhaka' },
  { name: 'daily-maintenance', data: {} },
);
worker.on('error', (error) =>
  process.stderr.write(`Worker error: ${error.code || 'WORKER_ERROR'}\n`),
);
async function stop() {
  await worker.close();
  await runtime.close();
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

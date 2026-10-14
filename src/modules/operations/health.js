import { now } from '../../utils/core.js';

export const heartbeatKey = 'adpilot:worker:heartbeat';
const bounded = async (work) => {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('PROBE_TIMEOUT')), 3000);
        timer.unref?.();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};
export function createTelemetry() {
  const values = [];
  return {
    record(value) {
      values.push(value);
      if (values.length > 1000) values.shift();
    },
    summary() {
      const recent = values.filter((v) => Date.now() - v.at < 900000),
        times = recent.map((v) => v.ms).sort((a, b) => a - b);
      return {
        requests: recent.length,
        errors: recent.filter((v) => v.status >= 500).length,
        p95Ms: times[Math.floor(times.length * 0.95)] || 0,
        windowMinutes: 15,
        uptimeSeconds: Math.floor(process.uptime()),
        rssBytes: process.memoryUsage().rss,
      };
    },
  };
}
export async function healthStatus(runtime, { worker = false } = {}) {
  const checks = await Promise.allSettled([
    bounded(() => runtime.store.ping()),
    runtime.jobs ? bounded(() => runtime.jobs.connection.ping()) : Promise.resolve('demo'),
    worker && runtime.jobs
      ? bounded(() => runtime.jobs.connection.get(heartbeatKey))
      : Promise.resolve('not-required'),
  ]);
  const dependencies = {
    database: checks[0].status === 'fulfilled' ? 'healthy' : 'unavailable',
    redis: checks[1].status === 'fulfilled' ? 'healthy' : 'unavailable',
    worker:
      worker && runtime.jobs
        ? checks[2].status === 'fulfilled' &&
          checks[2].value &&
          Date.now() - Date.parse(checks[2].value) < 90000
          ? 'healthy'
          : 'unavailable'
        : runtime.config.mode === 'demo'
          ? 'demo'
          : 'not-checked',
  };
  return {
    status: Object.values(dependencies).includes('unavailable') ? 'degraded' : 'ok',
    dependencies,
    checkedAt: now(),
    mode: runtime.config.mode,
    liveExecutionEnabled: runtime.config.liveExecution,
    backgroundJobsEnabled: runtime.config.mode === 'live' && Boolean(runtime.jobs),
  };
}
export async function operationsStatus(runtime, user) {
  const health = await healthStatus(runtime, { worker: true });
  const queue = runtime.jobs
    ? await bounded(() =>
        runtime.jobs.queue.getJobCounts('active', 'waiting', 'failed', 'delayed'),
      ).catch(() => null)
    : { active: 0, waiting: 0, failed: 0, delayed: 0 };
  const jobs = await runtime.store.page(
    'jobs',
    { businessId: user.businessId },
    { limit: 20, sort: 'updatedAt' },
  );
  const backup = await runtime.store.find('operational_snapshots', { kind: 'backup-latest' });
  const alerts = [];
  for (const [name, status] of Object.entries(health.dependencies))
    if (status === 'unavailable')
      alerts.push({
        severity: 'error',
        message: `${name} is unavailable. Saved records remain available after recovery.`,
      });
  if (queue?.failed)
    alerts.push({
      severity: 'warning',
      message: 'Background jobs failed. Review the affected job before retrying.',
    });
  if (
    runtime.config.mode === 'live' &&
    (!backup?.completedAt || Date.now() - Date.parse(backup.completedAt) > 36 * 3600000)
  )
    alerts.push({
      severity: 'warning',
      message: 'A verified offsite backup has not completed in the last 36 hours.',
    });
  return {
    health,
    queue,
    jobs: jobs.items,
    telemetry: runtime.telemetry.summary(),
    backup: backup
      ? {
          completedAt: backup.completedAt,
          mediaCount: backup.mediaCount,
          bytes: backup.bytes,
          restoreVerifiedAt: backup.restoreVerifiedAt || null,
        }
      : null,
    alerts,
  };
}

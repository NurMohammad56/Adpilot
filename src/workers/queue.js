import { Queue } from 'bullmq';
import Redis from 'ioredis';
export function createQueue(config) {
  if (config.mode === 'demo' || config.backgroundJobs === false) return null;
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: 1 });
  connection.on('error', () => process.stderr.write('Redis producer connection unavailable\n'));
  const queue = new Queue('adpilot-jobs', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 500,
      removeOnFail: 1000,
    },
  });
  return {
    queue,
    connection,
    async close() {
      await queue.close();
      await connection.quit();
    },
  };
}

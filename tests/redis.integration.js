import test from 'node:test';
import assert from 'node:assert/strict';
import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import crypto from 'node:crypto';
test(
  'real Redis/BullMQ completes a deduplicated read job and retries a transient read failure',
  { skip: !process.env.REDIS_TEST_URL, timeout: 20000 },
  async () => {
    const connection = new Redis(process.env.REDIS_TEST_URL, { maxRetriesPerRequest: null });
    const name = `adpilot-integration-${crypto.randomUUID()}`;
    const queue = new Queue(name, { connection });
    const events = new QueueEvents(name, { connection });
    let attempts = 0;
    const worker = new Worker(
      name,
      async (job) => {
        attempts++;
        if (attempts === 1) throw new Error('Transient read failure');
        return { businessId: job.data.businessId, synced: true };
      },
      { connection },
    );
    try {
      await events.waitUntilReady();
      const job = await queue.add(
        'insights-sync',
        { businessId: 'test-business' },
        { jobId: 'fixed-read-id', attempts: 2, backoff: { type: 'fixed', delay: 100 } },
      );
      const result = await job.waitUntilFinished(events, 10000);
      assert.equal(result.synced, true);
      assert.equal(attempts, 2);
      const repeat = await queue.add(
        'insights-sync',
        { businessId: 'test-business' },
        { jobId: 'fixed-read-id' },
      );
      assert.equal(repeat.id, job.id);
      assert.equal(await queue.getCompletedCount(), 1);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
      await connection.quit();
    }
  },
);

import 'dotenv/config';
import Redis from 'ioredis';
import { heartbeatKey } from './health.js';
const redis = new Redis(process.env.REDIS_URL, {
  connectTimeout: 2500,
  maxRetriesPerRequest: 0,
  retryStrategy: () => null,
});
redis.on('error', () => {});
try {
  const value = await redis.get(heartbeatKey);
  process.exitCode = value && Date.now() - Date.parse(value) < 90000 ? 0 : 1;
} catch {
  process.exitCode = 1;
} finally {
  redis.disconnect();
}

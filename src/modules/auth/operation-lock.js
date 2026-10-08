import crypto from 'node:crypto';
import { assert } from '../../utils/core.js';

export function operationLocks(redis) {
  const local = new Set();
  return async function exclusive(key, operation) {
    const token = crypto.randomBytes(16).toString('hex');
    const lockKey = `adpilot:operation:${key}`;
    if (redis) {
      const acquired = await redis.set(lockKey, token, 'PX', 300000, 'NX');
      assert(
        acquired === 'OK',
        409,
        'OPERATION_RUNNING',
        'This operation is already running. Wait for it to finish before trying again.',
      );
    } else {
      assert(
        !local.has(key),
        409,
        'OPERATION_RUNNING',
        'This operation is already running. Wait for it to finish before trying again.',
      );
      local.add(key);
    }
    try {
      return await operation();
    } finally {
      if (redis) {
        try {
          await redis.eval(
            "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
            1,
            lockKey,
            token,
          );
        } catch {
          process.stderr.write('Operation lock release unavailable; lease will expire.\n');
        }
      } else local.delete(key);
    }
  };
}

export function redisRateStore(redis, prefix) {
  let windowMs;
  return {
    localKeys: false,
    prefix: `adpilot:rate:${prefix}:`,
    init(options) {
      windowMs = options.windowMs;
    },
    async increment(key) {
      const [totalHits, ttl] = await redis.eval(
        "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return {n,redis.call('PTTL',KEYS[1])}",
        1,
        `adpilot:rate:${prefix}:${key}`,
        windowMs,
      );
      return {
        totalHits: Number(totalHits),
        resetTime: new Date(Date.now() + Math.max(0, Number(ttl))),
      };
    },
    async decrement(key) {
      await redis.eval(
        "local n=tonumber(redis.call('GET',KEYS[1]) or '0'); if n>0 then return redis.call('DECR',KEYS[1]) end; return 0",
        1,
        `adpilot:rate:${prefix}:${key}`,
      );
    },
    async resetKey(key) {
      await redis.del(`adpilot:rate:${prefix}:${key}`);
    },
  };
}

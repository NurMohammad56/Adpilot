import 'dotenv/config';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/index.js';
import { createStorage } from '../src/storage/index.js';

const config = loadConfig();
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'adpilot-storage-check-'));
const filename = path.join(root, 'probe');
const content = Buffer.from(`AdPilot private storage check ${crypto.randomUUID()}`);
const key = `_connection-checks/${crypto.randomUUID()}.txt`;
const storage = createStorage({ ...config, storageDriver: 's3' });
const report = { checkedAt: new Date().toISOString(), ok: false, driver: 's3' };
try {
  await fs.writeFile(filename, content);
  await storage.put(key, filename, 'text/plain');
  assert.deepEqual(await storage.bytes(key), content);
  const result = await storage.read(key, { start: 2, end: 8 });
  const chunks = [];
  for await (const chunk of result.body) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), content.subarray(2, 9));
  await storage.remove(key);
  Object.assign(report, { ok: true, write: true, read: true, range: true, delete: true });
} catch (error) {
  Object.assign(report, { code: error.name || error.code || 'STORAGE_CHECK_FAILED', status: error.$metadata?.httpStatusCode });
  process.exitCode = 1;
} finally {
  await storage.remove(key).catch(() => {});
  assert.ok(root.startsWith(path.join(os.tmpdir(), 'adpilot-storage-check-')));
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir('.data', { recursive: true });
  await fs.writeFile('.data/storage-status.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

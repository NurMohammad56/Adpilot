import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config/index.js';
import { MongoStore } from '../src/db/store.js';
import { createStorage } from '../src/storage/index.js';
const config = loadConfig();
assert.equal(config.storageDriver, 's3');
assert.equal(config.liveExecution, false);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(config.origin).hostname));
const credentials = await fs.readFile('.data/initial-admin.txt', 'utf8');
const email = credentials.match(/^Email: (.+)$/m)?.[1];
const password = credentials.match(/^Password: (.+)$/m)?.[1];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=', 'base64');
const name = `storage-check-${crypto.randomUUID()}.png`;
const store = new MongoStore(config.mongoUri);
let cookie, workspace, asset;
const report = { ok: false, checkedAt: new Date().toISOString(), storage: 'private-r2' };
try {
  const login = await fetch(`${config.origin}/api/auth/login`, { method: 'POST', headers: { Origin: config.origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(login.status, 200);
  cookie = login.headers.get('set-cookie').split(';')[0];
  workspace = (await login.json()).user.businessId;
  const headers = { Cookie: cookie, Origin: config.origin, 'x-workspace-id': workspace };
  const form = new FormData(); form.set('file', new Blob([png], { type: 'image/png' }), name);
  const uploaded = await fetch(`${config.origin}/api/media`, { method: 'POST', headers, body: form });
  assert.equal(uploaded.status, 201); asset = await uploaded.json();
  assert.equal(asset.storageDriver, 's3');
  const file = await fetch(`${config.origin}${asset.contentUrl}`, { headers });
  assert.equal(file.status, 200);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), png);
  const part = await fetch(`${config.origin}${asset.contentUrl}`, { headers: { ...headers, Range: 'bytes=2-8' } });
  assert.equal(part.status, 206);
  assert.deepEqual(Buffer.from(await part.arrayBuffer()), png.subarray(2, 9));
  const anonymous = await fetch(`${config.origin}${asset.contentUrl}`);
  assert.equal(anonymous.status, 401);
  Object.assign(report, { ok: true, authenticatedUpload: true, download: true, byteRange: true, rejectsAnonymous: true });
} finally {
  if (asset) {
    await store.connect();
    try {
      const row = await store.get('media_assets', asset.id);
      assert.ok(row && row.businessId === workspace && row.name === name && row.storageDriver === 's3');
      assert.equal(row.checksum, crypto.createHash('sha256').update(png).digest('hex'));
      await createStorage(config).remove(row.storageKey);
      await store.remove('media_assets', row.id);
      report.probeCleanedUp = true;
    } finally { await store.close(); }
  }
  await fs.writeFile('.data/live-media-status.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

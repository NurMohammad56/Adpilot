import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStorage } from '../src/storage/index.js';

test('S3 adapter signs private writes and reads, preserves bytes and supports video ranges', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'adpilot-s3-test-'));
  const content = Buffer.from('private-media-wire-fixture');
  const filename = path.join(root, 'source');
  await fs.writeFile(filename, content);
  const objects = new Map(),
    methods = [];
  const server = http.createServer(async (req, res) => {
    try {
      assert.match(req.headers.authorization || '', /^AWS4-HMAC-SHA256 /);
      assert.equal(req.url.split('?')[0], '/private-test/tenant/asset.mp4');
      methods.push(req.method);
      if (req.method === 'PUT') {
        assert.equal(req.headers['content-type'], 'video/mp4');
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        objects.set('asset', Buffer.concat(chunks));
        res.writeHead(200, { ETag: '"test"' }).end();
      } else if (req.method === 'DELETE') {
        objects.delete('asset');
        res.writeHead(204).end();
      } else {
        const bytes = objects.get('asset');
        const range = /bytes=(\d+)-(\d+)/.exec(req.headers.range || '');
        const body = range ? bytes.subarray(Number(range[1]), Number(range[2]) + 1) : bytes;
        res
          .writeHead(range ? 206 : 200, {
            'Content-Length': body.length,
            'Content-Type': 'video/mp4',
            ...(range ? { 'Content-Range': `bytes ${range[1]}-${range[2]}/${bytes.length}` } : {}),
          })
          .end(body);
      }
    } catch (error) {
      res.writeHead(500).end(error.message);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const storage = createStorage({
      storageDriver: 's3',
      storageBucket: 'private-test',
      storageRegion: 'us-east-1',
      storageEndpoint: `http://127.0.0.1:${server.address().port}`,
      storageAccessKey: 'test-access-key',
      storageSecretKey: 'test-secret-key',
    });
    await storage.put('tenant/asset.mp4', filename, 'video/mp4');
    assert.deepEqual(objects.get('asset'), content);
    assert.deepEqual(await storage.bytes('tenant/asset.mp4'), content);
    const range = await storage.read('tenant/asset.mp4', { start: 2, end: 8 });
    const chunks = [];
    for await (const chunk of range.body) chunks.push(chunk);
    assert.equal(range.size, 7);
    assert.deepEqual(Buffer.concat(chunks), content.subarray(2, 9));
    await storage.remove('tenant/asset.mp4');
    assert.equal(objects.size, 0);
    assert.deepEqual(methods, ['PUT', 'GET', 'GET', 'DELETE']);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    assert.ok(root.startsWith(path.join(os.tmpdir(), 'adpilot-s3-test-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

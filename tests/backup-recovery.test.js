import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoStore } from '../src/db/store.js';
import { fixture } from './helpers.js';
import { AppError } from '../src/utils/core.js';
import {
  createOffsiteBackup,
  restoreDrill,
  decryptBackup,
} from '../src/modules/operations/backup.js';

test(
  'complete Mongo/media backup restores indexes and missing objects without overwriting production or a populated target',
  { timeout: 180000 },
  async () => {
    const replica = await MongoMemoryReplSet.create({
        replSet: { count: 1 },
        binary: { version: '7.0.24' },
      }),
      store = new MongoStore(replica.getUri('backup_source'));
    await store.connect();
    const blobs = new Map(),
      storage = {
        driver: 's3',
        put: async (key, file) => blobs.set(key, await fs.readFile(file)),
        bytes: async (key) => {
          if (!blobs.has(key)) throw new AppError(404, 'STORAGE_OBJECT_MISSING', 'Missing object');
          return blobs.get(key);
        },
        remove: async (key) => blobs.delete(key),
      };
    const oldBackup = process.env.BACKUP_ENCRYPTION_KEY,
      oldToken = process.env.TOKEN_ENCRYPTION_KEY;
    try {
      const f = await fixture({ store, storage });
      f.config.mode = 'live';
      process.env.BACKUP_ENCRYPTION_KEY = 'ab'.repeat(32);
      process.env.TOKEN_ENCRYPTION_KEY = f.config.encryptionKey;
      const bytes = Buffer.from('Real saved media bytes'),
        asset = {
          businessId: f.user.businessId,
          name: 'saved.png',
          mime: 'image/png',
          type: 'image',
          status: 'ready',
          storageDriver: 's3',
          storageKey: `${f.user.businessId}/saved.png`,
          size: bytes.length,
          checksum: crypto.createHash('sha256').update(bytes).digest('hex'),
        };
      blobs.set(asset.storageKey, bytes);
      await store.insert('media_assets', asset);
      const before = await store.get('products', f.product.id),
        backup = await createOffsiteBackup(f);
      assert.equal(backup.mediaCount, 1);
      const decoded = decryptBackup(blobs.get(backup.objectKey), process.env.BACKUP_ENCRYPTION_KEY);
      assert.equal(decoded.media[0].key, asset.storageKey);
      const drill = await restoreDrill(f, 'adpilot_restore_drill');
      assert(drill.productionUnchanged);
      assert.equal(
        (
          await mongoose.connection
            .getClient()
            .db('adpilot_restore_drill')
            .listCollections()
            .toArray()
        ).length,
        0,
      );
      blobs.delete(asset.storageKey);
      const recovered = await restoreDrill(f, 'adpilot_restore_recovered', { retain: true });
      assert(recovered.retained);
      assert.deepEqual(blobs.get(asset.storageKey), bytes);
      assert.equal(
        await mongoose.connection
          .getClient()
          .db('adpilot_restore_recovered')
          .collection('products')
          .countDocuments(),
        1,
      );
      const indexes = await mongoose.connection
        .getClient()
        .db('adpilot_restore_recovered')
        .collection('products')
        .indexes();
      assert(indexes.some((index) => index.unique && index.key.id === 1));
      await assert.rejects(() => restoreDrill(f, 'adpilot_restore_recovered'), {
        code: 'RESTORE_NOT_EMPTY',
      });
      assert.deepEqual(await store.get('products', f.product.id), before);
      await mongoose.connection.getClient().db('adpilot_restore_recovered').dropDatabase();
      await assert.rejects(() => restoreDrill(f, 'backup_source'), { code: 'RESTORE_TARGET' });
    } finally {
      if (oldBackup === undefined) delete process.env.BACKUP_ENCRYPTION_KEY;
      else process.env.BACKUP_ENCRYPTION_KEY = oldBackup;
      if (oldToken === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
      else process.env.TOKEN_ENCRYPTION_KEY = oldToken;
      await store.close();
      await replica.stop();
    }
  },
);

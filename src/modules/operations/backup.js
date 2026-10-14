import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { collections } from '../../db/store.js';
import { createRuntime } from '../../runtime.js';
import { assert, now, id, unseal } from '../../utils/core.js';

const magic = Buffer.from('ADPILOT1');
export function encryptBackup(snapshot, key) {
  assert(
    /^[a-f0-9]{64}$/i.test(key || ''),
    503,
    'BACKUP_KEY',
    'Configure the private backup encryption key.',
  );
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const encrypted = Buffer.concat([
    cipher.update(gzipSync(Buffer.from(EJSON.stringify(snapshot, { relaxed: false })))),
    cipher.final(),
  ]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]);
}
export function decryptBackup(bytes, key) {
  assert(bytes.subarray(0, 8).equals(magic), 422, 'BACKUP_FORMAT', 'Unsupported backup format.');
  const cipher = crypto.createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, 'hex'),
    bytes.subarray(8, 20),
  );
  cipher.setAuthTag(bytes.subarray(20, 36));
  return EJSON.parse(
    gunzipSync(Buffer.concat([cipher.update(bytes.subarray(36)), cipher.final()])).toString(),
  );
}
export async function createOffsiteBackup(runtime) {
  assert(
    runtime.config.mode === 'live' && runtime.media.storage.driver === 's3',
    409,
    'BACKUP_STORAGE',
    'Offsite backups require live MongoDB and private S3/R2 storage.',
  );
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  assert(key, 503, 'BACKUP_KEY', 'Configure the private backup encryption key.');
  const snapshot = {
    format: 1,
    createdAt: now(),
    collections: {},
    indexes: {},
    media: [],
    runtimeSecrets: Object.fromEntries(
      [
        'TOKEN_ENCRYPTION_KEY',
        'MCP_SERVICE_KEY',
        'S3_BUCKET',
        'S3_ENDPOINT',
        'S3_REGION',
        'S3_ACCESS_KEY_ID',
        'S3_SECRET_ACCESS_KEY',
        'MONGODB_URI',
      ].map((k) => [k, process.env[k]]),
    ),
  };
  await runtime.store.transaction(async () => {
    for (const name of collections) snapshot.collections[name] = await runtime.store.list(name);
  });
  for (const name of collections)
    snapshot.indexes[name] = await mongoose.connection.db.collection(name).indexes();
  let mediaBytes = 0;
  const maximum = Number(process.env.BACKUP_MAX_BYTES || 134217728);
  for (const asset of snapshot.collections.media_assets.filter(
    (r) => r.status === 'ready' && !r.deletedAt,
  )) {
    mediaBytes += asset.size || 0;
    assert(
      mediaBytes <= maximum,
      503,
      'BACKUP_SIZE',
      'Backup media exceeds the configured archive size. Increase capacity or use a larger backup runner.',
    );
    const bytes = await runtime.media.storage.bytes(asset.storageKey);
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    assert(
      !asset.checksum || asset.checksum === checksum,
      503,
      'BACKUP_MEDIA',
      'Stored media checksum changed. Backup is incomplete.',
    );
    snapshot.media.push({
      key: asset.storageKey,
      mime: asset.mime,
      checksum,
      bytes: bytes.toString('base64'),
    });
  }
  const bytes = encryptBackup(snapshot, key),
    objectKey = `system-backups/${snapshot.createdAt.slice(0, 10)}/${id()}.bin`,
    temporary = path.join(os.tmpdir(), `adpilot-backup-${id()}.bin`);
  try {
    await fs.writeFile(temporary, bytes, { mode: 0o600 });
    await runtime.media.storage.put(objectKey, temporary, 'application/octet-stream');
    const downloaded = await runtime.media.storage.bytes(objectKey);
    assert(
      crypto.timingSafeEqual(
        crypto.createHash('sha256').update(bytes).digest(),
        crypto.createHash('sha256').update(downloaded).digest(),
      ),
      503,
      'BACKUP_VERIFY',
      'Offsite backup verification failed.',
    );
    const decoded = decryptBackup(downloaded, key);
    assert(
      decoded.collections.users.length && decoded.collections.businesses.length,
      503,
      'BACKUP_VERIFY',
      'Backup missing core records.',
    );
    const previous = await runtime.store.find('operational_snapshots', { kind: 'backup-latest' });
    const values = {
      kind: 'backup-latest',
      completedAt: now(),
      objectKey,
      bytes: bytes.length,
      mediaCount: snapshot.media.length,
      collections: collections.length,
      previousObjectKey: previous?.objectKey || null,
      restoreVerifiedAt: previous?.restoreVerifiedAt || null,
    };
    if (previous) await runtime.store.update('operational_snapshots', previous.id, values);
    else await runtime.store.insert('operational_snapshots', values);
    await runtime.store.insert('operational_snapshots', {
      kind: 'backup-history',
      objectKey,
      completedAt: now(),
    });
    for (const old of (
      await runtime.store.list('operational_snapshots', { kind: 'backup-history' })
    )
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .slice(30)) {
      if (/^system-backups\/\d{4}-\d{2}-\d{2}\/[a-f0-9-]+\.bin$/.test(old.objectKey)) {
        await runtime.media.storage.remove(old.objectKey);
        await runtime.store.remove('operational_snapshots', old.id);
      }
    }
    return {
      objectKey,
      bytes: bytes.length,
      mediaCount: snapshot.media.length,
      collections: collections.length,
    };
  } finally {
    await fs.rm(temporary, { force: true });
  }
}
export async function restoreDrill(runtime, targetName, { retain = false } = {}) {
  assert(
    /^adpilot_restore_[a-z0-9_]+$/.test(targetName || ''),
    422,
    'RESTORE_TARGET',
    'Use an isolated adpilot_restore_ database; production restore is deliberately excluded.',
  );
  const latest = await runtime.store.find('operational_snapshots', { kind: 'backup-latest' });
  assert(latest, 404, 'BACKUP_MISSING', 'No verified offsite backup available.');
  const snapshot = decryptBackup(
    await runtime.media.storage.bytes(latest.objectKey),
    process.env.BACKUP_ENCRYPTION_KEY,
  );
  const target = mongoose.connection.getClient().db(targetName);
  assert(
    (await target.listCollections().toArray()).length === 0,
    409,
    'RESTORE_NOT_EMPTY',
    'Restore target must be empty.',
  );
  let completed = false;
  try {
    for (const [name, rows] of Object.entries(snapshot.collections)) {
      if (rows.length)
        await target.collection(name).insertMany(
          rows.map((row) => ({
            ...row,
            _id: row.id,
            ...(retain && name === 'jobs' && ['queued', 'running'].includes(row.status)
              ? {
                  status: 'failed',
                  errorCode: 'RECOVERED_JOB',
                  errorMessage: 'Recovered from backup. Review current inputs before retrying.',
                }
              : {}),
          })),
        );
      assert(
        (await target.collection(name).countDocuments()) === rows.length,
        503,
        'RESTORE_COUNT',
        'Restored collection count differs.',
      );
      for (const index of snapshot.indexes?.[name] || []) {
        const { v, ns, ...definition } = index;
        if (index.name !== '_id_')
          await target
            .collection(name)
            .createIndex(
              definition.key,
              Object.fromEntries(Object.entries(definition).filter(([k]) => k !== 'key')),
            );
      }
    }
    for (const item of snapshot.media) {
      const bytes = Buffer.from(item.bytes, 'base64');
      assert(
        crypto.createHash('sha256').update(bytes).digest('hex') === item.checksum,
        503,
        'RESTORE_MEDIA',
        'Archived media checksum differs.',
      );
      if (retain) {
        let existing;
        try {
          existing = await runtime.media.storage.bytes(item.key);
        } catch (error) {
          if (error.code !== 'STORAGE_OBJECT_MISSING' && error.code !== 'ENOENT') throw error;
        }
        if (existing)
          assert(
            crypto.createHash('sha256').update(existing).digest('hex') === item.checksum,
            409,
            'RESTORE_MEDIA_CONFLICT',
            'An existing media object differs. Recovery will not overwrite it.',
          );
        else {
          const file = path.join(os.tmpdir(), `adpilot-recover-${id()}`);
          try {
            await fs.writeFile(file, bytes, { mode: 0o600 });
            await runtime.media.storage.put(item.key, file, item.mime);
          } finally {
            await fs.rm(file, { force: true });
          }
        }
      }
    }
    assert(
      snapshot.runtimeSecrets.TOKEN_ENCRYPTION_KEY === runtime.config.encryptionKey,
      503,
      'RESTORE_KEY',
      'Archived integration encryption key differs.',
    );
    for (const row of snapshot.collections.integrations)
      for (const field of ['encryptedToken', 'encryptedAppSecret', 'encryptedKey'])
        if (row[field]) unseal(row[field], snapshot.runtimeSecrets.TOKEN_ENCRYPTION_KEY);
    await runtime.store.update('operational_snapshots', latest.id, { restoreVerifiedAt: now() });
    completed = true;
    return {
      restored: true,
      isolatedDatabase: targetName,
      collections: Object.keys(snapshot.collections).length,
      mediaVerified: snapshot.media.length,
      productionUnchanged: !retain,
      productionDatabaseUnchanged: true,
      retained: retain,
      paidExecution: 'Disable LIVE_EXECUTION_ENABLED before pointing an app at recovered records.',
    };
  } finally {
    if (!retain || !completed) await target.dropDatabase();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  const runtime = await createRuntime({ seed: false });
  try {
    const result = ['drill', 'recover'].includes(process.argv[2])
      ? await restoreDrill(runtime, process.argv[3], { retain: process.argv[2] === 'recover' })
      : await createOffsiteBackup(runtime);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ error: error.code || 'BACKUP_FAILED', message: error.message }));
    process.exitCode = 1;
  } finally {
    await runtime.close();
  }
}

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { assert, AppError } from '../utils/core.js';

export function createStorage(config) {
  if ((config.storageDriver || 'local') === 'local') {
    const root = config.storagePath || path.resolve('.data/uploads');
    const filename = (key) => {
      const resolved = path.resolve(root, key);
      assert(
        resolved.startsWith(`${path.resolve(root)}${path.sep}`),
        422,
        'STORAGE_PATH',
        'Invalid storage key',
      );
      return resolved;
    };
    return {
      driver: 'local',
      async put(key, file) {
        const target = filename(key);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(file, target);
      },
      async read(key, range) {
        const stat = await fs.stat(filename(key));
        const start = range?.start || 0;
        const end = range?.end ?? stat.size - 1;
        return { body: createReadStream(filename(key), { start, end }), size: end - start + 1 };
      },
      async bytes(key) {
        return fs.readFile(filename(key));
      },
      async remove(key) {
        await fs.rm(filename(key), { force: true });
      },
    };
  }
  assert(
    config.storageDriver === 's3' &&
      config.storageBucket &&
      config.storageAccessKey &&
      config.storageSecretKey,
    503,
    'STORAGE_CONFIG',
    'S3 storage requires a bucket and server-side access credentials',
  );
  const client = new S3Client({
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 8000, requestTimeout: 30000 },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    region: config.storageRegion,
    endpoint: config.storageEndpoint,
    forcePathStyle: Boolean(config.storageEndpoint),
    credentials: { accessKeyId: config.storageAccessKey, secretAccessKey: config.storageSecretKey },
  });
  const send = async (command) => {
    try { return await client.send(command); }
    catch (error) {
      const missing = error.$metadata?.httpStatusCode === 404;
      throw new AppError(missing ? 404 : 503, missing ? 'STORAGE_OBJECT_MISSING' : 'STORAGE_UNAVAILABLE',
        missing ? 'The stored file is missing. Contact the workspace administrator.' : 'File storage is temporarily unavailable. Your form is preserved; retry when the connection is restored.');
    }
  };
  return {
    driver: 's3',
    async put(key, file, mime) {
      const stat = await fs.stat(file);
      await send(
        new PutObjectCommand({
          Bucket: config.storageBucket,
          Key: key,
          Body: createReadStream(file),
          ContentLength: stat.size,
          ContentType: mime,
        }),
      );
    },
    async read(key, range) {
      const object = await send(
        new GetObjectCommand({
          Bucket: config.storageBucket,
          Key: key,
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        }),
      );
      return { body: object.Body, size: object.ContentLength };
    },
    async bytes(key) {
      const object = await send(
        new GetObjectCommand({ Bucket: config.storageBucket, Key: key }),
      );
      return Buffer.from(await object.Body.transformToByteArray());
    },
    async remove(key) {
      await send(new DeleteObjectCommand({ Bucket: config.storageBucket, Key: key }));
    },
  };
}

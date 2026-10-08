import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileTypeFromFile } from 'file-type';
import { assert, id } from '../../utils/core.js';

const types = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
]);
export class MediaService {
  constructor(platform, storage) {
    this.platform = platform;
    this.store = platform.store;
    this.storage = storage;
  }
  public(row) {
    const { storageKey, ...safe } = row;
    return {
      ...safe,
      contentUrl: `${this.platform.config.basePath || ''}/api/media/${row.id}/content`,
    };
  }
  async upload(user, file) {
    let saved;
    try {
      assert(file, 422, 'FILE_REQUIRED', 'Select an image or video');
      const type = await fileTypeFromFile(file.path);
      assert(
        type && types.has(type.mime),
        422,
        'FILE_TYPE',
        'Upload JPEG, PNG, WebP, MP4 or WebM. File contents must match the format.',
      );
      const isVideo = type.mime.startsWith('video/');
      assert(
        file.size <= (isVideo ? 50 : 10) * 1024 * 1024,
        413,
        'FILE_SIZE',
        'Images can be up to 10 MB and videos up to 50 MB',
      );
      const bytes = await fs.readFile(file.path);
      const assetId = id();
      const key = `${user.businessId}/${assetId}.${types.get(type.mime)}`;
      saved = await this.store.transaction(async () => {
        const rows = await this.store.list('media_assets', { businessId: user.businessId });
        assert(
          rows.reduce((sum, row) => sum + row.size, 0) + file.size <= 2 * 1024 ** 3,
          413,
          'STORAGE_QUOTA',
          'This workspace has reached its 2 GB storage limit',
        );
        const business = await this.store.get('businesses', user.businessId);
        await this.store.update('businesses', business.id, {
          mediaQuotaVersion: (business.mediaQuotaVersion || 0) + 1,
        });
        return this.store.insert('media_assets', {
          id: assetId,
          businessId: user.businessId,
          name: file.originalname.replace(/[\x00-\x1f<>]/g, '').slice(0, 160),
          mime: type.mime,
          type: isVideo ? 'video' : 'image',
          size: file.size,
          checksum: crypto.createHash('sha256').update(bytes).digest('hex'),
          storageKey: key,
          storageDriver: this.storage.driver,
          status: 'uploading',
          createdBy: user.id,
        });
      });
      await this.storage.put(key, file.path, type.mime);
      return this.store.transaction(async () => {
        const ready = await this.store.update('media_assets', saved.id, { status: 'ready' });
        await this.platform.audit(user, 'media.uploaded', saved.id, {
          type: ready.type,
          size: ready.size,
        });
        return this.public(ready);
      });
    } catch (error) {
      if (saved) {
        await this.storage.remove(saved.storageKey).catch(() => {});
        await this.store.remove('media_assets', saved.id);
      }
      throw error;
    } finally {
      if (file?.path) await fs.rm(file.path, { force: true });
    }
  }
  async asset(user, assetId) {
    const asset = await this.platform.owned('media_assets', assetId, user);
    assert(
      asset.status === 'ready' && asset.storageDriver === this.storage.driver,
      409,
      'MEDIA_UNAVAILABLE',
      'Asset is unavailable in the configured storage',
    );
    return asset;
  }
  async bind(user, creative) {
    if (!creative.mediaAssetId) {
      const { mediaType, assetChecksum, thumbnailChecksum, thumbnailAssetId, ...rest } = creative;
      return rest;
    }
    const asset = await this.asset(user, creative.mediaAssetId);
    let thumbnail;
    if (asset.type === 'video') {
      assert(
        creative.thumbnailAssetId,
        422,
        'THUMBNAIL_REQUIRED',
        'Select an uploaded image as the video cover',
      );
      thumbnail = await this.asset(user, creative.thumbnailAssetId);
      assert(thumbnail.type === 'image', 422, 'THUMBNAIL_TYPE', 'A video cover must be an image');
    }
    return {
      ...creative,
      mediaType: asset.type,
      assetChecksum: asset.checksum,
      ...(thumbnail ? { thumbnailChecksum: thumbnail.checksum } : {}),
    };
  }
  async verify(user, creative) {
    if (!creative.mediaAssetId) return;
    const current = await this.bind(user, creative);
    assert(
      current.assetChecksum === creative.assetChecksum &&
        current.thumbnailChecksum === creative.thumbnailChecksum,
      409,
      'MEDIA_CHANGED',
      'Approved media changed',
    );
  }
  async readBytes(businessId, assetId, checksum) {
    const asset = await this.asset({ businessId }, assetId);
    assert(
      asset.checksum === checksum,
      409,
      'MEDIA_CHANGED',
      'Media does not match the approved snapshot',
    );
    const bytes = await this.storage.bytes(asset.storageKey);
    assert(
      crypto.createHash('sha256').update(bytes).digest('hex') === checksum,
      409,
      'MEDIA_CHANGED',
      'Stored media integrity check failed',
    );
    return { bytes, asset };
  }
}

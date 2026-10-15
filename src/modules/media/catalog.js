import crypto from 'node:crypto';
import { assert, hash, seal, unseal } from '../../utils/core.js';
import { productCardImages } from './product-creatives.js';
const xml = (value) =>
  String(value ?? '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(
      /[&<>"']/g,
      (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char],
    );
const base = (platform) =>
  `${platform.config.origin}${platform.config.basePath || ''}/api/catalog-feeds`;
export function publicFeed(platform, feed) {
  return {
    id: feed.id,
    productIds: feed.productIds,
    status: feed.status,
    createdAt: feed.createdAt,
    ...(feed.status === 'active'
      ? {
          url: `${base(platform)}/${feed.id}/feed.xml?token=${unseal(feed.encryptedToken, platform.config.encryptionKey)}`,
        }
      : {}),
  };
}
export async function createCatalogFeed(platform, user, productIds, acknowledgeSharing) {
  platform.requireApprover(user);
  assert(
    acknowledgeSharing,
    422,
    'CATALOG_SHARING',
    'Confirm sharing selected product details and images through the feed link.',
  );
  assert(
    productIds.length && productIds.length <= 100 && new Set(productIds).size === productIds.length,
    422,
    'CATALOG_PRODUCTS',
    'Select different products.',
  );
  for (const id of productIds) {
    const product = await platform.owned('products', id, user);
    assert(
      product.sellingPrice > 0 &&
        product.landingUrl &&
        (product.mediaAssetId || product.mediaAssetIds?.length || product.imageUrl),
      422,
      'CATALOG_READY',
      'Every feed product needs a real selling price, HTTPS product page and product image.',
    );
    assert(
      product.condition,
      422,
      'CATALOG_CONDITION',
      'Edit the product and confirm whether it is new, used or refurbished before sharing a catalogue feed.',
    );
    assert(
      (await productCardImages(platform, user, product)).length > 0,
      422,
      'CATALOG_IMAGE',
      'Catalogue products must have product images.',
    );
  }
  const token = crypto.randomBytes(32).toString('hex');
  const saved = await platform.store.insert('catalog_feeds', {
    businessId: user.businessId,
    productIds,
    status: 'active',
    createdBy: user.id,
    tokenHash: hash(token),
    encryptedToken: seal(token, platform.config.encryptionKey),
  });
  await platform.audit(user, 'catalog.feed_shared', saved.id, { productCount: productIds.length });
  return publicFeed(platform, saved);
}
export async function resolveCatalogFeed(platform, id, token) {
  const feed = await platform.store.get('catalog_feeds', id);
  const valid =
    typeof token === 'string' &&
    /^[a-f0-9]{64}$/.test(token) &&
    feed?.status === 'active' &&
    crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(feed.tokenHash));
  assert(valid, 404, 'NOT_FOUND', 'Feed link is invalid or revoked.');
  return feed;
}
export async function catalogXML(platform, feed, token) {
  const items = [];
  for (const id of feed.productIds) {
    const product = await platform.store.get('products', id);
    if (
      !product ||
      product.businessId !== feed.businessId ||
      !(product.sellingPrice > 0) ||
      !product.landingUrl ||
      !product.condition
    )
      continue;
    const selected = (
      await productCardImages(platform, { businessId: feed.businessId }, product)
    )[0];
    const image = selected?.mediaAssetId
      ? `${base(platform)}/${feed.id}/images/${selected.mediaAssetId}?token=${token}`
      : selected?.imageUrl;
    if (!image) continue;
    const fields = {
      id: product.id,
      title: product.name,
      description: product.description,
      availability: product.inventory > 0 ? 'in stock' : 'out of stock',
      condition: product.condition,
      price: `${product.sellingPrice.toFixed(2)} BDT`,
      link: product.landingUrl,
      image_link: image,
      ...(product.brand ? { brand: product.brand } : {}),
      ...(product.gtin ? { gtin: product.gtin } : {}),
    };
    items.push(
      `<item>${Object.entries(fields)
        .map(([key, value]) => `<g:${key}>${xml(value)}</g:${key}>`)
        .join('')}</item>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>AdPilot product feed</title><link>${xml(platform.config.origin)}</link><description>Owner-selected product details. Verify category-specific catalogue requirements in Meta.</description>${items.join('')}</channel></rss>`;
}
export async function catalogImage(platform, feed, assetId) {
  let linked = false;
  for (const id of feed.productIds) {
    const product = await platform.store.get('products', id);
    if (
      product?.businessId === feed.businessId &&
      [product.mediaAssetId, ...(product.mediaAssetIds || [])].includes(assetId)
    ) {
      linked = true;
      break;
    }
  }
  assert(linked, 404, 'NOT_FOUND', 'Image is not included in this feed.');
  const asset = await platform.media.asset({ businessId: feed.businessId }, assetId);
  assert(asset.type === 'image', 404, 'NOT_FOUND', 'Image not found.');
  return platform.media.readBytes(feed.businessId, asset.id, asset.checksum);
}

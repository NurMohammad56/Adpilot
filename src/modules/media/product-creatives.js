import { assert } from '../../utils/core.js';

export function productCreativeRefs(product) {
  const refs = [
    ...(product.mediaAssetId
      ? [{ mediaAssetId: product.mediaAssetId, thumbnailAssetId: product.thumbnailAssetId || null }]
      : product.imageUrl && !product.mediaAssetIds?.length
        ? [{ imageUrl: product.imageUrl }]
        : []),
    ...(product.mediaAssetIds || []).map((mediaAssetId) => ({
      mediaAssetId,
      thumbnailAssetId: null,
    })),
    ...(product.videoCreatives || []),
  ];
  return [...new Map(refs.map((ref) => [ref.mediaAssetId || ref.imageUrl, ref])).values()];
}

export async function productCardImages(platform, user, product) {
  const images = [];
  for (const id of new Set(
    [product.mediaAssetId, ...(product.mediaAssetIds || [])].filter(Boolean),
  )) {
    const asset = await platform.media.asset(user, id);
    if (asset.type === 'image') images.push({ mediaAssetId: id, name: asset.name, imageUrl: '' });
  }
  if (product.imageUrl)
    images.push({ mediaAssetId: null, name: 'Product image URL', imageUrl: product.imageUrl });
  return images;
}

export async function selectProductCardImage(platform, user, product, selection) {
  const images = await productCardImages(platform, user, product);
  const image =
    selection === undefined ? images[0] : images.find((item) => item.mediaAssetId === selection);
  assert(
    image,
    422,
    'CAROUSEL_PRODUCT_IMAGE',
    'Choose an image saved on this product. Videos cannot be carousel cover images.',
  );
  return image;
}

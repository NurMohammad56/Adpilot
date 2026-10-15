import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fixture, productInput } from './helpers.js';
import { createProductGroup } from '../src/modules/campaigns/product-group.js';
import { campaignProductSources } from '../src/modules/campaigns/product-sources.js';
import { productSchema, planEditSchema } from '../src/modules/schemas.js';
import { LiveMetaAdapter } from '../src/integrations/meta/adapter.js';
import { deletionPreview, deleteManagedRecord } from '../src/modules/records.js';

const ready = (extra) => ({
  ...structuredClone(productInput),
  landingUrl: 'https://shop.example/product',
  imageUrl: '',
  ...extra,
});
async function assets(f, imageCount = 2, videoCount = 1) {
  const bytes = Buffer.from('verified fixture bytes');
  f.media.storage.bytes = async () => bytes;
  const result = [];
  for (let i = 0; i < imageCount + videoCount; i++)
    result.push(
      await f.store.insert('media_assets', {
        businessId: f.user.businessId,
        name: `Creative ${i}`,
        status: 'ready',
        storageDriver: f.media.storage.driver,
        type: i < imageCount ? 'image' : 'video',
        mime: i < imageCount ? 'image/png' : 'video/webm',
        checksum: crypto.createHash('sha256').update(bytes).digest('hex'),
        size: bytes.length,
        storageKey: `fixture-${i}`,
      }),
    );
  return { images: result.slice(0, imageCount), videos: result.slice(imageCount) };
}

test('all saved product photos and videos become checksum-bound creative variants; ten creatives remain editable', async () => {
  const f = await fixture();
  try {
    const { images, videos } = await assets(f, 6, 4);
    const product = await f.platform.updateProduct(
      f.user,
      f.product.id,
      productSchema.parse(
        ready({
        imageUrl: 'https://shop.example/fallback.jpg',
          mediaAssetIds: images.map((item) => item.id),
          videoCreatives: videos.map((item) => ({
            mediaAssetId: item.id,
            thumbnailAssetId: images[0].id,
          })),
        }),
      ),
    );
    const plan = await f.platform.createPlan(f.user, product.id);
    assert.equal(plan.ads.length, 10);
    assert.equal(new Set(plan.ads.map((ad) => ad.mediaAssetId)).size, 10);
    assert.equal(
      plan.ads.filter((ad) => ad.mediaType === 'video' && ad.thumbnailChecksum).length,
      4,
    );
    assert.equal(plan.research.visualAnalysis.assets.length, 6);
    assert.equal(plan.budgetRecommendation.dailyBudget <= product.dailyBudgetCeiling, true);
    assert.equal(
      planEditSchema.parse({ ads: plan.ads.map(({ hypothesis, ...ad }) => ad) }).ads.length,
      10,
    );
    const revised = await f.platform.revisePlan(f.user, plan.id, { ads: plan.ads.slice(0, 2) });
    assert.equal(revised.ads.length, 2);
    assert.equal(f.meta.calls.length, 0);
  } finally {
    await f.close();
  }
});

test('carousel chooses a saved photo even when the primary asset is video; chosen images and product links survive revision and Meta payload', async () => {
  const f = await fixture();
  try {
    const { images, videos } = await assets(f);
    const first = await f.platform.updateProduct(
      f.user,
      f.product.id,
      ready({
        mediaAssetId: videos[0].id,
        thumbnailAssetId: images[0].id,
        mediaAssetIds: images.map((item) => item.id),
      }),
    );
    const second = await f.platform.createProduct(
      f.user,
      ready({
        name: 'Another product',
        imageUrl: 'https://shop.example/second.jpg',
        landingUrl: 'https://shop.example/second',
      }),
    );
    const sources = await campaignProductSources(f.platform, f.user);
    const row = sources.products.find((row) => row.id === first.id);
    assert.deepEqual(
      row.carouselImages.map((item) => item.mediaAssetId),
      images.map((item) => item.id),
    );
    assert.equal(row.carouselMissing.length, 0);
    const input = {
      productIds: [first.id, second.id],
      cardImages: [{ productId: first.id, mediaAssetId: images[1].id }],
      name: 'Selected photos',
      landingUrl: 'https://shop.example/all',
      dailyBudget: 200,
      durationDays: 5,
    };
    const plan = await createProductGroup(f.platform, f.user, input);
    assert.equal(plan.ads[0].cards[0].mediaAssetId, images[1].id);
    assert.equal(plan.ads[0].cards[0].link, first.landingUrl);
    assert.equal(plan.ads[0].cards[1].link, second.landingUrl);
    const revised = await f.platform.revisePlan(f.user, plan.id, { dailyBudget: 100 });
    assert.equal(revised.ads[0].cards[0].mediaAssetId, images[1].id);
    const meta = new LiveMetaAdapter({ businessId: f.user.businessId }, f.media);
    meta.media = f.media;
    meta.request = async () => ({ images: { uploaded: { hash: 'chosen-image-hash' } } });
    const story = await meta.creativeStory(
      plan.ads[0],
      plan,
      { adAccountId: '1', pageId: '2' },
      async () => {},
    );
    assert.equal(story.link_data.child_attachments[0].image_hash, 'chosen-image-hash');
    assert.equal(story.link_data.child_attachments[0].link, first.landingUrl);
    await assert.rejects(
      createProductGroup(f.platform, f.user, {
        ...input,
        cardImages: [{ productId: first.id, mediaAssetId: videos[0].id }],
      }),
      { code: 'CAROUSEL_PRODUCT_IMAGE' },
    );
    const unrelated = (await assets(f, 1, 0)).images[0];
    await assert.rejects(
      createProductGroup(f.platform, f.user, {
        ...input,
        cardImages: [{ productId: first.id, mediaAssetId: unrelated.id }],
      }),
      { code: 'CAROUSEL_PRODUCT_IMAGE' },
    );
    const changed = structuredClone(plan.ads);
    changed[0].cards[0].mediaAssetId = images[0].id;
    await assert.rejects(f.platform.revisePlan(f.user, plan.id, { ads: changed }), {
      code: 'CAROUSEL_PRODUCTS',
    });
  } finally {
    await f.close();
  }
});

test('video validation rejects missing covers, wrong types and foreign assets; deleting a cover detaches saved video references', async () => {
  const f = await fixture();
  try {
    const { images, videos } = await assets(f);
    assert.equal(
      productSchema.safeParse(ready({ videoCreatives: [{ mediaAssetId: videos[0].id }] })).success,
      false,
    );
    await assert.rejects(
      f.platform.updateProduct(
        f.user,
        f.product.id,
        ready({ videoCreatives: [{ mediaAssetId: images[0].id, thumbnailAssetId: images[1].id }] }),
      ),
      { code: 'PRODUCT_VIDEO' },
    );
    const other = await f.auth.createWorkspace(f.user, 'Other media owner');
    const foreign = await f.store.insert('media_assets', {
      ...images[0],
      id: crypto.randomUUID(),
      businessId: other.id,
    });
    await assert.rejects(
      f.platform.updateProduct(
        f.user,
        f.product.id,
        ready({ videoCreatives: [{ mediaAssetId: videos[0].id, thumbnailAssetId: foreign.id }] }),
      ),
      { code: 'NOT_FOUND' },
    );
    await f.platform.updateProduct(
      f.user,
      f.product.id,
      ready({
        mediaAssetIds: [images[1].id],
        videoCreatives: [{ mediaAssetId: videos[0].id, thumbnailAssetId: images[0].id }],
      }),
    );
    const preview = await deletionPreview(f.platform, f.user, 'media', images[0].id);
    await deleteManagedRecord(f.platform, f.user, 'media', images[0].id, preview.token);
    const current = await f.store.get('products', f.product.id);
    assert.deepEqual(current.videoCreatives, []);
    assert.deepEqual(current.mediaAssetIds, [images[1].id]);
  } finally {
    await f.close();
  }
});

import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=',
  'base64',
);
const ready = (name) => ({
  name,
  category: 'Accessories',
  description: 'Actual product with confirmed material and features.',
  inventory: 20,
  sellingPrice: 1500,
  minProfit: 200,
  desiredMargin: 0.2,
  costs: {
    product: 400,
    packaging: 20,
    delivery: 80,
    paymentFixed: 0,
    paymentPercent: 0,
    other: 0,
    returnRate: 0.1,
    returnCost: 80,
  },
  dailyBudgetCeiling: 500,
  testBudgetCeiling: 3500,
  landingUrl: 'https://shop.example/' + name.replaceAll(' ', '-'),
  imageUrl: '',
});

test('multiple product photos and video save, produce distinct creative drafts and allow a persisted carousel photo choice with its own product link', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeAttached();
  const post = async (path, data) => {
    const r = await page.request.post('/api' + path, { headers: { Origin: origin }, data });
    expect(r.ok(), await r.text()).toBeTruthy();
    return r.json();
  };
  const workspace = await post('/workspaces', { name: 'Product media QA' });
  await post('/workspaces/switch', { businessId: workspace.id });
  const first = await post('/products', ready('Media bag'));
  const second = await post('/products', {
    ...ready('Second bag'),
    imageUrl: 'https://shop.example/second.jpg',
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Media bag', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const video = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    canvas.getContext('2d').fillRect(0, 0, 100, 100);
    const stream = canvas.captureStream(5),
      recorder = new MediaRecorder(stream, { mimeType: 'video/webm' }),
      chunks = [];
    const blob = await new Promise((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      recorder.start();
      setTimeout(() => {
        recorder.stop();
        stream.getTracks().forEach((track) => track.stop());
      }, 250);
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await dialog.getByLabel('Upload product photos or videos', { exact: true }).setInputFiles([
    { name: 'bag-front.png', mimeType: 'image/png', buffer: png },
    { name: 'bag-side.png', mimeType: 'image/png', buffer: png },
    { name: 'bag-demo.webm', mimeType: 'video/webm', buffer: Buffer.from(video) },
  ]);
  await expect(
    dialog.locator('.product-media-gallery .product-media-grid').first().locator('article'),
  ).toHaveCount(3);
  await expect(
    dialog.getByRole('button', { name: 'Save product changes', exact: true }),
  ).toBeEnabled();
  const media = await (await page.request.get('/api/media')).json(),
    front = media.find((asset) => asset.name === 'bag-front.png'),
    side = media.find((asset) => asset.name === 'bag-side.png'),
    clip = media.find((asset) => asset.name === 'bag-demo.webm');
  await dialog.getByLabel('Cover image for bag-demo.webm', { exact: true }).selectOption(front.id);
  await dialog.getByRole('button', { name: 'Save product changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const saved = (await (await page.request.get('/api/overview')).json()).products.find(
    (product) => product.id === first.id,
  );
  expect(saved.mediaAssetIds).toEqual([front.id, side.id]);
  expect(saved.videoCreatives).toEqual([{ mediaAssetId: clip.id, thumbnailAssetId: front.id }]);
  const card = page.locator('.product-card').filter({ hasText: 'Media bag' });
  await card.getByRole('button', { name: 'Generate campaign plan', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const plan = (await (await page.request.get('/api/overview')).json()).plans.find(
    (plan) => plan.productId === first.id,
  );
  expect(new Set(plan.ads.map((ad) => ad.mediaAssetId))).toEqual(
    new Set([front.id, side.id, clip.id]),
  );
  expect(plan.ads.find((ad) => ad.mediaAssetId === clip.id).mediaType).toBe('video');
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('radio', { name: 'Several products - swipe cards' }).check();
  const picker = page.locator('.carousel-source-picker');
  await expect(picker.getByRole('button', { name: 'Refresh products and sources' })).toBeEnabled();
  await picker.getByRole('checkbox', { name: /Media bag/ }).check();
  await picker.getByRole('checkbox', { name: /Second bag/ }).check();
  await picker.getByRole('radio', { name: 'Use image 2 for Media bag', exact: true }).check();
  await page.getByLabel('Collection campaign name', { exact: true }).fill('Chosen product images');
  await page
    .getByLabel('Collection / shop page URL', { exact: true })
    .fill('https://shop.example/all');
  await page.getByLabel('Shared daily planning budget (BDT)', { exact: true }).fill('200');
  await page.reload();
  await expect(
    picker.getByRole('radio', { name: 'Use image 2 for Media bag', exact: true }),
  ).toBeChecked();
  await page.locator('.language-switch').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await picker.locator('.carousel-image-options').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await page.screenshot({ path: '.data/product-media-carousel-mobile.png' });
  await page.locator('.language-switch').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Research & prepare carousel plan', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const group = (await (await page.request.get('/api/overview')).json()).plans.find(
    (plan) => plan.kind === 'product-group',
  );
  expect(group.ads[0].cards[0].mediaAssetId).toBe(side.id);
  expect(group.ads[0].cards[0].link).toBe(first.landingUrl);
  expect(group.ads[0].cards[1].link).toBe(second.landingUrl);
  expect(errors).toEqual([]);
});

import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
const headers = { Origin: origin };
const product = {
  name: 'Deletion QA product',
  category: 'Accessories',
  description: 'A real canvas tote product for QA.',
  costs: {
    product: 500,
    packaging: 20,
    delivery: 80,
    paymentFixed: 0,
    paymentPercent: 0,
    other: 0,
    returnRate: 0,
    returnCost: 160,
  },
  inventory: 50,
  minProfit: 200,
  desiredMargin: 0.2,
  sellingPrice: 1500,
  landingUrl: '',
  imageUrl: '',
  dailyBudgetCeiling: 1500,
  testBudgetCeiling: 10500,
};
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=',
  'base64',
);
async function workspace(page, name) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeVisible();
  const response = await page.request.post('/api/workspaces', { headers, data: { name } });
  expect(response.ok()).toBeTruthy();
  const business = await response.json();
  expect(
    (
      await page.request.post('/api/workspaces/switch', {
        headers,
        data: { businessId: business.id },
      })
    ).ok(),
  ).toBeTruthy();
  await page.reload();
}
const nav = (page, name) =>
  page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
async function post(page, path, data) {
  const response = await page.request.post(`/api${path}`, { headers, data });
  expect(response.ok()).toBeTruthy();
  return response.json();
}
async function confirm(page) {
  const dialog = page.getByRole('dialog', { name: 'Review deletion' });
  await expect(dialog.getByRole('button', { name: 'Delete permanently' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(dialog).toBeHidden();
}

test('cancel and cascade deletion remove only the reviewed product, reports, plans and approvals and survive reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await workspace(page, 'Record cascade QA');
  const row = await post(page, '/products', product);
  const plan = await post(page, `/products/${row.id}/plans`, {});
  await post(page, `/plans/${plan.id}/submit`, {});
  await page.reload();
  await nav(page, 'Products');
  await page.getByRole('button', { name: `Delete ${product.name}`, exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review deletion' });
  await expect(review).toContainText('Campaign plans');
  await expect(review).toContainText('Approvals');
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Delete ${product.name}`, exact: true }).click();
  await confirm(page);
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeHidden();
  const overview = await (await page.request.get('/api/overview')).json();
  expect(overview.products).toHaveLength(0);
  expect(overview.plans).toHaveLength(0);
  expect(overview.approvals).toHaveLength(0);
  await page.reload();
  await nav(page, 'Products');
  await expect(page.getByText('Add your first product', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('individual approval, plan, saved ad and media deletion work; Settings exposes other records and Bangla review fits mobile', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await workspace(page, 'Individual deletion QA');
  const row = await post(page, '/products', product);
  const plan = await post(page, `/products/${row.id}/plans`, {});
  await post(page, `/plans/${plan.id}/submit`, {});
  await page.reload();
  await nav(page, 'Approvals');
  await page
    .locator('.approval-row')
    .getByRole('button', { name: /^Delete / })
    .click();
  await confirm(page);
  await expect(page.locator('.approval-row')).toHaveCount(0);
  await nav(page, 'Campaign plans');
  await expect(page.locator('.plan-card')).toContainText('draft');
  await page
    .locator('.plan-card')
    .getByRole('button', { name: /^Delete / })
    .click();
  await confirm(page);
  await expect(page.locator('.plan-card')).toHaveCount(0);
  await post(page, '/ad-library', {
    adUrl: '923456789',
    pageName: 'Saved ad deletion QA',
    country: 'BD',
    productId: row.id,
    observedAt: new Date().toISOString(),
    adCopy: 'Actual ad copy for QA.',
  });
  await nav(page, 'Ad Library research');
  await page.getByRole('button', { name: 'Delete Saved ad deletion QA', exact: true }).click();
  await confirm(page);
  await expect(page.locator('.ad-library-card')).toHaveCount(0);
  const uploaded = await page.request.post('/api/media', {
    headers,
    multipart: {
      file: { name: 'Delete QA.png', mimeType: 'image/png', buffer: png },
    },
  });
  expect(uploaded.ok()).toBeTruthy();
  const asset = await uploaded.json();
  await nav(page, 'Media library');
  await page.getByRole('button', { name: 'Delete Delete QA.png', exact: true }).click();
  await confirm(page);
  await expect(page.locator('.media-card')).toHaveCount(0);
  expect((await page.request.get(`/api/media/${asset.id}/content`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const manager = page.locator('.saved-data-manager');
  await expect(manager.getByRole('heading', { name: 'Manage saved data' })).toBeVisible();
  await manager.getByLabel('Saved record type').selectOption('products');
  await expect(manager).toContainText(product.name);
  await page.getByRole('button', { name: 'বাংলায় দেখুন', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await manager.getByRole('button', { name: `Delete ${product.name}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'মুছে ফেলার আগে যাচাই করুন' });
  await expect(dialog.getByRole('button', { name: 'স্থায়ীভাবে মুছে ফেলুন' })).toBeEnabled();
  const bounds = await dialog.boundingBox();
  expect(bounds.width).toBeLessThanOrEqual(390);
  await dialog.getByRole('button', { name: 'বাতিল', exact: true }).click();
  expect(errors).toEqual([]);
});

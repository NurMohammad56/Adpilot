import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const productInput = {
  category: 'Accessories',
  description: 'A bag with handles and a main compartment.',
  costs: {
    product: 500,
    packaging: 50,
    delivery: 80,
    paymentFixed: 20,
    paymentPercent: 0,
    other: 30,
    returnRate: 0,
    returnCost: 160,
  },
  inventory: 100,
  minProfit: 200,
  desiredMargin: 0.2,
  sellingPrice: 1500,
  dailyBudgetCeiling: 1500,
  testBudgetCeiling: 10500,
};
const bn = JSON.parse(
  fs.readFileSync(new URL('../web/locales/product-bn.json', import.meta.url), 'utf8'),
);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=',
  'base64',
);
async function workspace(page, name) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeVisible();
  const response = await page.request.post('/api/workspaces', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  const value = await response.json();
  const switched = await page.request.post('/api/workspaces/switch', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    data: { businessId: value.id },
  });
  expect(switched.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Products', exact: true }).click();
  return value;
}
test('automatic product form calculates delivery and profit, explains assumptions and analyzes uploaded images', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await workspace(page, 'Automatic product QA');
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Calculation mode', { exact: true })).toHaveValue('automatic');
  await dialog.getByLabel('Product name', { exact: true }).fill('Everyday canvas bag');
  await dialog.getByLabel('Category / niche', { exact: true }).selectOption('Accessories');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('An everyday bag with visible handles and a main compartment.');
  await dialog.getByLabel('Available inventory', { exact: true }).fill('20');
  await dialog.getByLabel('Actual selling price', { exact: true }).fill('1000');
  await dialog.getByLabel('Product cost', { exact: true }).fill('400');
  await dialog.getByLabel('Packaging', { exact: true }).fill('20');
  await dialog.getByLabel('Courier delivery charge', { exact: true }).fill('100');
  await dialog.getByLabel('Delivery charge collected from customer', { exact: true }).fill('60');
  await expect(dialog.locator('.cost-preview')).toContainText('368.67 BDT');
  await dialog.getByRole('button', { name: 'Help: Profit reserve', exact: true }).focus();
  await expect(dialog.getByRole('tooltip')).toContainText('maximum ad cost');
  await dialog.getByText('Advanced fees and return assumptions', { exact: true }).click();
  await dialog.getByLabel('Return shipping cost', { exact: true }).fill('40');
  await expect(dialog.locator('.cost-preview')).toContainText('365.55 BDT');
  const upload = await page.request.post('/api/media', {
    headers: { Origin: 'http://127.0.0.1:4173' },
    multipart: { file: { name: 'test-product.png', mimeType: 'image/png', buffer: png } },
  });
  expect(upload.ok()).toBeTruthy();
  const asset = await upload.json();
  // Refresh the picker through dialog navigation; unfinished costs must survive.
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  await dialog.getByLabel('Uploaded image or video', { exact: true }).selectOption(asset.id);
  await dialog.getByRole('button', { name: 'Analyze product images with AI' }).click();
  await expect(
    dialog.getByText('Demo only: image bytes were checked but no live visual model was called.'),
  ).toBeVisible();
  await dialog.getByRole('checkbox').last().check();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/products') && response.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  const product = await (await saved).json();
  expect(product.costs.delivery).toBe(40);
  expect(product.costs.returnCost).toBe(160);
  expect(product.minProfit).toBe(156.67);
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('carousel guide keeps one budget, real card destinations, and catalogue feeds survive reload and revoke', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await workspace(page, 'Carousel and feed QA');
  const ids = [];
  for (const [name, slug] of [
    ['Canvas bag', 'bag'],
    ['Daily backpack', 'backpack'],
  ]) {
    const response = await page.request.post('/api/products', {
      headers: { Origin: 'http://127.0.0.1:4173' },
      data: {
        ...productInput,
        name,
        condition: 'new',
        landingUrl: `https://shop.example/${slug}`,
        imageUrl: `https://shop.example/${slug}.png`,
      },
    });
    expect(response.ok()).toBeTruthy();
    ids.push((await response.json()).id);
  }
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('radio', { name: 'Several products - swipe cards' }).check();
  await page.locator('.product-selection').getByRole('checkbox').nth(0).check();
  await page.locator('.product-selection').getByRole('checkbox').nth(1).check();
  await page.getByLabel('Collection campaign name', { exact: true }).fill('Everyday bags');
  await page
    .getByLabel('Collection / shop page URL', { exact: true })
    .fill('https://shop.example/bags');
  await page.getByLabel('Shared daily planning budget (BDT)', { exact: true }).fill('200');
  await page.getByLabel('Test days', { exact: true }).fill('5');
  await page.getByRole('button', { name: 'Research & prepare carousel plan' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Creatives', exact: true }).click();
  await expect(
    dialog.locator('.product-carousel').first().locator('.carousel-product'),
  ).toHaveCount(2);
  await dialog.getByRole('button', { name: 'Manual guide', exact: true }).click();
  await dialog.getByRole('button', { name: 'Request manual guide approval' }).click();
  await dialog.getByRole('button', { name: 'Approve guide - no automatic spend' }).click();
  await expect(dialog.getByText('Approved guide - create it yourself in Facebook')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Execute approved action' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('radio', { name: 'Catalogue / dynamic ads guide' }).check();
  await page.locator('.catalog-setup').getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create catalogue feed link' }).click();
  const input = page.getByLabel('Catalogue feed URL', { exact: true });
  await expect(input).toBeVisible();
  const feedUrl = await input.inputValue();
  const xml = await (await page.request.get(feedUrl)).text();
  expect(xml).toContain(ids[0]);
  expect(xml).toContain('1500.00 BDT');
  await page.reload();
  await page.getByRole('navigation').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('radio', { name: 'Catalogue / dynamic ads guide' }).check();
  await expect(input).toHaveValue(feedUrl);
  await page.getByRole('button', { name: 'Revoke feed link' }).click();
  await expect(input).not.toBeVisible();
  expect((await page.request.get(feedUrl)).status()).toBe(404);
});

test('automatic product help and multi-product selector fit a mobile Bangla screen', async ({
  page,
}) => {
  await workspace(page, 'Mobile product QA');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'বাংলায় দেখুন' }).click();
  await page.getByRole('button', { name: 'পণ্য যোগ করুন', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel(bn['Calculation mode'], { exact: true })).toHaveValue('automatic');
  await dialog.getByLabel(bn['Actual selling price'], { exact: true }).fill('1000');
  await dialog
    .getByRole('button', { name: `সহায়তা: ${bn['Profit reserve']}`, exact: true })
    .click();
  await expect(dialog.getByRole('tooltip')).toContainText('লাভ');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const sizes = await dialog.evaluate((el) => ({
    scroll: el.scrollWidth,
    width: el.clientWidth,
    font: getComputedStyle(el.querySelector('input')).fontSize,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width + 1);
  expect(parseFloat(sizes.font)).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: '.data/product-studio-mobile-bn.png', fullPage: true });
});

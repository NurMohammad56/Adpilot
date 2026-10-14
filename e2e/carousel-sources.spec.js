import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
const ready = (name) => ({
  name,
  category: 'Accessories',
  description: 'A real bag with a main compartment and handles.',
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
  landingUrl: 'https://shop.example/bag',
  imageUrl: 'https://shop.example/bag.png',
});
async function setup(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeAttached();
  const post = async (path, data) => {
    const response = await page.request.post(`/api${path}`, { headers: { Origin: origin }, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const workspace = await post('/workspaces', { name: 'Connected carousel QA' });
  await post('/workspaces/switch', { businessId: workspace.id });
  const first = await post('/products', ready('My saved bag'));
  const research = await post('/research', {
    name: 'Researched shopper bag',
    kind: 'physical-product',
    productCategory: 'Accessories',
    description: 'A bag idea that needs actual supplier and cost confirmation.',
    buyerProfile: 'Bangladesh bag buyers',
    candidateCountries: ['BD'],
  });
  const linked = await post('/research', {
    name: 'Existing bag research',
    kind: 'physical-product',
    productId: first.id,
    description: first.description,
    buyerProfile: 'Local bag buyers',
    candidateCountries: ['BD'],
  });
  const ad = await post('/ad-library', {
    adUrl: '834567891',
    pageName: 'Competitor Source QA',
    country: 'BD',
    observedAt: new Date().toISOString(),
    adCopy: 'Competitor bag 999 BDT, observed offer only.',
  });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('radio', { name: 'Several products - swipe cards' }).check();
  await expect(page.getByRole('button', { name: 'Refresh products and sources' })).toBeEnabled();
  return { first, research, linked, ad, post };
}

test('research and competitor sources keep carousel inputs, save actual products and reuse existing products', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const { first, research, ad } = await setup(page);
  await page
    .locator('.product-selection')
    .getByRole('checkbox', { name: /My saved bag/ })
    .check();
  await page.getByLabel('Collection campaign name', { exact: true }).fill('My related bags');
  await page
    .getByLabel('Collection / shop page URL', { exact: true })
    .fill('https://shop.example/bags');
  await page.getByLabel('Shared daily planning budget (BDT)', { exact: true }).fill('200');
  await page.getByLabel('Product source', { exact: true }).selectOption('research');
  const linked = page.locator('.carousel-source-row').filter({ hasText: 'Existing bag research' });
  await expect(linked.getByRole('button', { name: 'Already selected' })).toBeDisabled();
  const idea = page.locator('.carousel-source-row').filter({ hasText: research.name });
  await idea.getByRole('button', { name: 'Set up my product & add' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a product', exact: true });
  await expect(dialog.getByLabel('Product name', { exact: true })).toHaveValue(research.name);
  await expect(dialog.getByLabel('Actual selling price', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Product source', { exact: true }).selectOption('ad-library');
  await page.getByRole('button', { name: 'Set up my product & add' }).click();
  await expect(dialog.getByLabel('Product name', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Creative image URL (HTTPS)', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('checkbox', { name: /Competitor Source QA/ })).toBeChecked();
  await dialog.getByLabel('Product name', { exact: true }).fill('My actual second bag');
  await dialog.getByLabel('Category / niche', { exact: true }).selectOption('Accessories');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('My verified product with handles and a compartment.');
  await dialog.getByLabel('Available inventory', { exact: true }).fill('12');
  await dialog.getByLabel('Actual selling price', { exact: true }).fill('1200');
  await dialog.getByLabel('Product cost', { exact: true }).fill('400');
  await dialog.getByLabel('Packaging', { exact: true }).fill('20');
  await dialog.getByLabel('Delivery fee preset', { exact: true }).selectOption('dhaka');
  await dialog
    .getByLabel('Product / landing page URL', { exact: true })
    .fill('https://shop.example/second');
  await dialog
    .getByLabel('Creative image URL (HTTPS)', { exact: true })
    .fill('https://shop.example/second.png');
  await dialog.getByRole('checkbox', { name: /I reviewed the costs and assumptions/ }).check();
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.carousel-selection-summary')).toContainText('2 / 10');
  await expect(page.getByLabel('Collection campaign name', { exact: true })).toHaveValue(
    'My related bags',
  );
  await expect(page.getByLabel('Shared daily planning budget (BDT)', { exact: true })).toHaveValue(
    '200',
  );
  const overview = await (await page.request.get('/api/overview')).json();
  const actual = overview.products.find((product) => product.name === 'My actual second bag');
  expect(actual.adLibraryIds).toContain(ad.id);
  expect(actual.sourceContext).toEqual({ kind: 'ad-library', id: ad.id });
  expect(overview.products).toHaveLength(2);
  await expect(page.getByRole('button', { name: 'Already selected' })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Several products - swipe cards' })).toBeChecked();
  await expect(page.locator('.carousel-selection-summary')).toContainText('2 / 10');
  await expect(page.getByLabel('Collection campaign name', { exact: true })).toHaveValue(
    'My related bags',
  );
  await page.getByRole('button', { name: 'Research & prepare carousel plan' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Creatives', exact: true }).click();
  await expect(page.locator('.product-carousel').first().locator('.carousel-product')).toHaveCount(
    2,
  );
  expect(overview.campaigns).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('source picker stays readable in Bangla mobile and incomplete products block research until corrected', async ({
  page,
}) => {
  const { first } = await setup(page);
  await page.getByLabel('Product source', { exact: true }).selectOption('research');
  await page
    .locator('.carousel-source-row')
    .filter({ hasText: 'Existing bag research' })
    .getByRole('button', { name: 'Add saved product to carousel' })
    .click();
  await page.getByLabel('Product source', { exact: true }).selectOption('saved');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.language-switch').click();
  await expect(page.locator('.carousel-source-picker')).toContainText(
    'ওয়ার্কস্পেস থেকে প্রোডাক্ট বাছুন',
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.carousel-source-picker').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.data/carousel-sources-mobile-bn.png' });
  await page.locator('.language-switch').click();
  const response = await page.request.put(`/api/products/${first.id}`, {
    headers: { Origin: origin },
    data: { ...ready(first.name), imageUrl: '' },
  });
  expect(response.ok()).toBeTruthy();
  await page.reload();
  const row = page.locator('.carousel-source-row').filter({ hasText: first.name });
  await expect(row).toContainText('product image');
  await expect(
    page.getByRole('button', { name: 'Research & prepare carousel plan' }),
  ).toBeDisabled();
  await row.getByRole('button', { name: 'Complete product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Creative image URL (HTTPS)', { exact: true })
    .fill('https://shop.example/fixed.png');
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().endsWith(`/api/products/${first.id}`),
  );
  await dialog.getByRole('button', { name: 'Save product changes' }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(dialog).not.toBeVisible();
  await expect(row.locator('.carousel-source-missing')).toHaveCount(0);
});

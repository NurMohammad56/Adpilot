import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
async function workspace(page, name) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  const created = await page.request.post('/api/workspaces', {
    headers: { Origin: origin },
    data: { name },
  });
  expect(created.ok()).toBeTruthy();
  const row = await created.json();
  await page.request.post('/api/workspaces/switch', {
    headers: { Origin: origin },
    data: { businessId: row.id },
  });
  await page.reload();
}
test('product facts connect once to research, keyword search, captured prices/history and a campaign report', async ({
  page,
}) => {
  await workspace(page, 'Product research memory QA');
  const product = await page.request.post('/api/products', {
    headers: { Origin: origin },
    data: {
      name: 'Bluetooth Earbuds',
      category: 'Electronics',
      description:
        'Wireless earbuds with a microphone and charging case. Specifications still need customer validation.',
      sellingPrice: 1800,
      inventory: 20,
      minProfit: 100,
      desiredMargin: 0.2,
      dailyBudgetCeiling: 400,
      testBudgetCeiling: 2800,
      landingUrl: '',
      imageUrl: '',
      costs: {
        product: 700,
        packaging: 20,
        delivery: 80,
        paymentFixed: 0,
        paymentPercent: 0,
        other: 0,
        returnRate: 0,
        returnCost: 100,
      },
    },
  });
  expect(product.ok()).toBeTruthy();
  const savedProduct = await product.json();
  await page.reload();
  await page.locator('.sidebar nav').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Research this product', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Product research', exact: true })).toBeVisible();
  await expect(page.locator('.research-project')).toHaveCount(1);
  await page.getByRole('button', { name: 'Build search checklist', exact: true }).click();
  await expect(
    page.locator('.search-checklist').getByRole('link', { name: 'TWS earbuds', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Save competitor ads', exact: true }).click();
  await expect(page.getByLabel('Product keyword or advertiser name', { exact: true })).toHaveValue(
    'Bluetooth Earbuds',
  );
  const form = page.locator('.ad-library-form');
  await expect(
    form.getByLabel('Link to your product or research brief', { exact: true }),
  ).not.toHaveValue('');
  await form.locator('.quick-ad-capture summary').click();
  await form
    .getByLabel('Copied ad details', { exact: true })
    .fill(
      'Advertiser: Fixture seller\nLibrary ID: 556677001\nPage ID: 556677099\nBluetooth earbuds with charging case. Owner-supplied QA observation.\nActual visible offer: BDT 1500',
    );
  await form.getByRole('button', { name: 'Fill form from pasted details', exact: true }).click();
  await expect(form.getByLabel('Advertised price amount (optional)', { exact: true })).toHaveValue(
    '1500',
  );
  await expect(form.getByLabel('Comparable to your product?', { exact: true })).toHaveValue(
    'unknown',
  );
  await form.getByLabel('What is this price for?', { exact: true }).selectOption('unit');
  await form.getByLabel('Comparable to your product?', { exact: true }).selectOption('comparable');
  await form.getByRole('button', { name: 'Save ad observation', exact: true }).click();
  await expect(form.getByRole('heading', { name: 'Edit saved ad', exact: true })).toBeVisible();
  await form.getByLabel('Advertised price amount (optional)', { exact: true }).fill('1600');
  await form.getByRole('button', { name: 'Update ad observation', exact: true }).click();
  const workbench = page.locator('.research-evidence-workbench');
  await expect(workbench.locator('.price-range')).toContainText('1,600');
  await workbench.getByText('View price history', { exact: true }).click();
  await expect(workbench.locator('table')).toContainText('BDT 1,500');
  await expect(workbench.locator('table')).toContainText('BDT 1,600');
  const projects = await (await page.request.get('/api/research')).json();
  expect(projects).toHaveLength(1);
  const reuse = await page.request.post(`/api/products/${savedProduct.id}/research-brief`, {
    headers: { Origin: origin },
    data: {},
  });
  expect((await reuse.json()).reused).toBe(true);
  await page.locator('.sidebar nav').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Generate campaign plan', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Research', exact: true }).click();
  await expect(dialog.locator('.market-sample')).toContainText('Fixture seller');
  await expect(dialog.locator('.market-sample')).toContainText('1,600');
  await page.screenshot({ path: '.data/research-memory-report-demo.png' });
});

test('official API results are reviewed in the capture form without automatically saving or inferring prices', async ({
  page,
}) => {
  await workspace(page, 'Official library capture QA');
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/ad-library')
      writes++;
  });
  await page.route('**/api/ad-library/api-search', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            libraryAdId: '998877001',
            adUrl: 'https://www.facebook.com/ads/library/?id=998877001',
            pageId: '998877099',
            pageName: 'Fixture German advertiser',
            country: 'DE',
            adCopy: 'A returned API fixture, not a live search.',
            startDateObserved: '2026-10-01',
            observedAt: new Date().toISOString(),
            statusObserved: 'active',
          },
        ],
        hasMore: true,
        demo: false,
        reuse: { cached: false },
      },
    }),
  );
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: 'Ad Library research', exact: true })
    .click();
  const official = page.locator('.official-ad-search');
  await official.locator('summary').click();
  await expect(
    official.getByRole('button', { name: 'Search official API', exact: true }),
  ).toBeDisabled();
  await page.getByLabel('Product keyword or advertiser name', { exact: true }).fill('Earbuds');
  await page.getByLabel('Search country', { exact: true }).selectOption('DE');
  await official.getByRole('button', { name: 'Search official API', exact: true }).click();
  await expect(official).toContainText('More matches exist');
  await official.getByRole('button', { name: 'Review in capture form', exact: true }).click();
  const form = page.locator('.ad-library-form');
  await expect(form.getByLabel('Advertiser / Facebook Page name', { exact: true })).toHaveValue(
    'Fixture German advertiser',
  );
  await expect(form.getByLabel('Actual ad copy', { exact: true })).toHaveValue(
    'A returned API fixture, not a live search.',
  );
  await expect(form.getByLabel('Advertised price amount (optional)', { exact: true })).toHaveValue(
    '',
  );
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'বাংলায় দেখুন', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/research-memory-mobile-demo.png' });
});

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
const bn = JSON.parse(
  fs.readFileSync(new URL('../web/locales/ad-library-bn.json', import.meta.url), 'utf8'),
);
const origin = 'http://127.0.0.1:4173';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=',
  'base64',
);
async function workspace(page, name) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeVisible();
  const created = await page.request.post('/api/workspaces', {
    headers: { Origin: origin },
    data: { name },
  });
  expect(created.ok()).toBeTruthy();
  const value = await created.json();
  const switched = await page.request.post('/api/workspaces/switch', {
    headers: { Origin: origin },
    data: { businessId: value.id },
  });
  expect(switched.ok()).toBeTruthy();
  await page.reload();
  return value;
}
test('free Ad Library search, saved screenshots, AI analysis and research linkage survive reload and archive', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await workspace(page, 'Ad Library QA');
  const productResponse = await page.request.post('/api/products', {
    headers: { Origin: origin },
    data: {
      name: 'Canvas bag QA',
      category: 'Accessories',
      description: 'A canvas bag with handles and an inside pocket.',
      costs: {
        product: 500,
        packaging: 20,
        delivery: 80,
        paymentFixed: 0,
        paymentPercent: 0,
        other: 0,
        returnRate: 0.1,
        returnCost: 100,
      },
      inventory: 10,
      minProfit: 100,
      desiredMargin: 0.2,
      sellingPrice: 1500,
      landingUrl: 'https://shop.example/bag',
      imageUrl: '',
      dailyBudgetCeiling: 300,
      testBudgetCeiling: 2100,
    },
  });
  expect(productResponse.ok()).toBeTruthy();
  const product = await productResponse.json();
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Ad Library research', exact: true })
    .click();
  await page.getByLabel('Product keyword or advertiser name', { exact: true }).fill('থ্রি পিস');
  await page.getByLabel('Search country', { exact: true }).selectOption('BD');
  await page.getByLabel('Search country', { exact: true }).selectOption('CA');
  await expect(page.getByLabel('Country searched', { exact: true })).toHaveValue('CA');
  await page.getByLabel('Search country', { exact: true }).selectOption('BD');
  let link = new URL(
    await page.getByRole('link', { name: 'Open free Ad Library search' }).getAttribute('href'),
  );
  expect(link.hostname).toBe('www.facebook.com');
  expect(link.searchParams.get('q')).toBe('থ্রি পিস');
  expect(link.searchParams.get('active_status')).toBe('active');
  await page.getByLabel('Competitor Page ID (optional)', { exact: true }).fill('500030636523227');
  link = new URL(
    await page.getByRole('link', { name: 'Open free Ad Library search' }).getAttribute('href'),
  );
  expect(link.searchParams.get('view_all_page_id')).toBe('500030636523227');
  await page.getByLabel('Ad Library link or Library ID', { exact: true }).fill('123456789');
  await page
    .getByLabel('Advertiser / Facebook Page name', { exact: true })
    .fill('Demo competitor QA');
  await page
    .getByLabel('Link to your product or research brief', { exact: true })
    .selectOption(`product:${product.id}`);
  await page
    .getByLabel('Actual ad copy', { exact: true })
    .fill(
      'A practical bag with an inside pocket. This is a demo observation, not a verified real ad.',
    );
  await page
    .getByLabel('Offer / price shown (optional)', { exact: true })
    .fill('Demo advertised offer 999 BDT; specifications not confirmed.');
  await page
    .getByLabel('Upload ad screenshots', { exact: true })
    .setInputFiles({ name: 'ad-screenshot.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('checkbox', { name: 'ad-screenshot.png' })).toBeChecked();
  await page.getByRole('button', { name: 'Save ad observation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit saved ad' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'ad-screenshot.png' })).toBeChecked();
  await page.getByRole('button', { name: 'Analyze saved ad with AI', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ad analysis', exact: true })).toBeVisible();
  await expect(
    page.getByText('Demo analysis only. No live AI model was called.', { exact: true }),
  ).toBeVisible();
  const state = await (await page.request.get('/api/ad-library')).json();
  expect(state.observations).toHaveLength(1);
  expect(state.observations[0].analysis.confidence).toBe('Low');
  const planResponse = await page.request.post(`/api/products/${product.id}/plans`, {
    headers: { Origin: origin },
    data: {},
  });
  expect(planResponse.ok()).toBeTruthy();
  const plan = await planResponse.json();
  expect(plan.research.adLibraryObservations[0].id).toBe(state.observations[0].id);
  expect(plan.research.sourcedPrices).toEqual([]);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Ad analysis', exact: true })).toBeVisible();
  await page
    .getByLabel('Actual ad copy', { exact: true })
    .fill('Changed demo message. No competitor performance is supplied.');
  await expect(
    page.getByRole('button', { name: 'Analyze saved ad with AI', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Update ad observation', exact: true }).click();
  await expect(page.getByText(/This is an earlier analysis/)).toBeVisible();
  await page.getByRole('button', { name: 'Archive observation', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show archived observations' }).check();
  await page.getByRole('button', { name: 'Restore observation', exact: true }).click();
  const archivedPlan = await (await page.request.get(`/api/plans/${plan.id}`)).json();
  expect(archivedPlan.research.adLibraryObservations[0].adCopy).toContain('practical bag');
  expect(errors).toEqual([]);
});

test('Bangla Ad Library guidance, field help and unfinished notes fit mobile and survive navigation', async ({
  page,
}) => {
  await workspace(page, 'Bangla Ad Library QA');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Ad Library research', exact: true })
    .click();
  await page
    .getByLabel('Advertiser / Facebook Page name', { exact: true })
    .fill('Draft advertiser');
  await page.getByRole('navigation').getByRole('button', { name: 'Products', exact: true }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Ad Library research', exact: true })
    .click();
  await expect(page.getByLabel('Advertiser / Facebook Page name', { exact: true })).toHaveValue(
    'Draft advertiser',
  );
  await page.getByRole('button', { name: 'বাংলায় দেখুন' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: bn['Ad Library research'], exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: `সহায়তা: ${bn['Ad Library link or Library ID']}`, exact: true })
    .focus();
  await expect(page.getByRole('tooltip')).toContainText('Library ID');
  const bounds = await page.locator('.ad-library-form').evaluate((panel) => {
    const box = panel.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      scrollLeft: panel.scrollLeft,
      fields: [...panel.querySelectorAll('.field')].map((field) => ({
        left: field.getBoundingClientRect().left,
        right: field.getBoundingClientRect().right,
      })),
    };
  });
  expect(bounds.scrollLeft).toBe(0);
  for (const field of bounds.fields) {
    expect(field.left).toBeGreaterThanOrEqual(bounds.left);
    expect(field.right).toBeLessThanOrEqual(bounds.right);
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(
    await page
      .getByLabel(bn['Advertiser / Facebook Page name'], { exact: true })
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await page.screenshot({ path: '.data/ad-library-mobile-bn.png', fullPage: true });
});

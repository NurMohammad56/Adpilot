import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const origin = 'http://127.0.0.1:4173';
const bn = JSON.parse(
  fs.readFileSync(new URL('../web/locales/ad-library-bn.json', import.meta.url), 'utf8'),
);
const nav = async (page, name) => {
  await page.locator('.sidebar').hover();
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
};

test('saved ad actions align and carry only competitor evidence into an independent product draft', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeVisible();
  const created = await page.request.post('/api/workspaces', {
    headers: { Origin: origin },
    data: { name: 'Ad to product QA' },
  });
  expect(created.ok()).toBeTruthy();
  const business = await created.json();
  const switched = await page.request.post('/api/workspaces/switch', {
    headers: { Origin: origin },
    data: { businessId: business.id },
  });
  expect(switched.ok()).toBeTruthy();
  await page.reload();
  await nav(page, 'Ad Library research');
  await page.getByLabel('Product keyword or advertiser name', { exact: true }).fill('Canvas bag');
  await page.getByLabel('Ad Library link or Library ID', { exact: true }).fill('123456789');
  await page
    .getByLabel('Advertiser / Facebook Page name', { exact: true })
    .fill('Competitor Canvas QA');
  await page
    .getByLabel('Actual ad copy', { exact: true })
    .fill(
      'Competitor canvas bag, special price 999 BDT. These are competitor claims, not your product facts.',
    );
  await page.getByLabel('Offer / price shown (optional)', { exact: true }).fill('999 BDT');
  await page.getByRole('button', { name: 'Save ad observation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit saved ad' })).toBeVisible();
  const card = page
    .locator('.ad-library-saved .ad-library-card')
    .filter({ hasText: 'Competitor Canvas QA' });
  const before = await (await page.request.get('/api/overview')).json();

  const management = await card.locator('.ad-card-management').evaluate((element) =>
    [...element.children].map((child) => {
      const { y, height } = child.getBoundingClientRect();
      return { y, height };
    }),
  );
  expect(management).toHaveLength(2);
  expect(Math.abs(management[0].y - management[1].y)).toBeLessThan(1);
  expect(Math.abs(management[0].height - management[1].height)).toBeLessThan(1);
  expect(management[0].height).toBeGreaterThanOrEqual(44);
  await page.locator('.official-ad-search > summary').click();
  const controls = await page.locator('.official-ad-search-controls').evaluate((element) => {
    const { gap } = getComputedStyle(element);
    return {
      gap,
      margins: [...element.children].map((child) => getComputedStyle(child).marginTop),
    };
  });
  expect(parseFloat(controls.gap)).toBeGreaterThanOrEqual(12);
  expect(controls.margins.every((value) => value === '0px')).toBeTruthy();
  await expect(
    page.getByRole('button', { name: 'Search official API', exact: true }),
  ).toBeDisabled();

  await card.getByRole('button', { name: 'Continue with product', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a product', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Product name', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Actual selling price', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('checkbox', { name: /Competitor Canvas QA/ })).toBeChecked();
  await expect(dialog.getByLabel('Creative image URL (HTTPS)', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Product name', { exact: true }).fill('My own verified canvas bag');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await nav(page, 'Ad Library research');
  await card.getByRole('button', { name: 'Continue with product', exact: true }).click();
  await expect(dialog.getByLabel('Product name', { exact: true })).toHaveValue(
    'My own verified canvas bag',
  );
  await expect(dialog.getByRole('checkbox', { name: /Competitor Canvas QA/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const after = await (await page.request.get('/api/overview')).json();
  for (const kind of ['products', 'plans', 'approvals', 'campaigns'])
    expect(after[kind]).toEqual(before[kind]);

  await nav(page, 'Ad Library research');
  await card.getByRole('button', { name: 'Archive observation', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Show archived observations' }).check();
  await expect(
    card.getByRole('button', { name: 'Continue with product', exact: true }),
  ).toBeDisabled();
  await card.getByRole('button', { name: 'Restore observation', exact: true }).click();
  await expect(
    card.getByRole('button', { name: 'Continue with product', exact: true }),
  ).toBeEnabled();
  await page.locator('.language-switch').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    card.getByRole('button', { name: bn['Continue with product'], exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  const buttonBounds = await card.locator('.ad-card-actions').evaluate((element) => {
    const box = element.getBoundingClientRect();
    return [...element.querySelectorAll('button')].every((button) => {
      const bounds = button.getBoundingClientRect();
      return bounds.left >= box.left && bounds.right <= box.right + 1;
    });
  });
  expect(buttonBounds).toBeTruthy();
  expect(errors).toEqual([]);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.data/ad-actions-mobile-bn.png' });
});

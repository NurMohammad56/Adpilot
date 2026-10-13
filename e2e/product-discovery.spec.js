import { test, expect } from '@playwright/test';
test('discovery, shortlist, ad checking, actual-product prefill and Research studio remain connected', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeVisible();
  await expect(page.locator('.workspace-pulse')).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Product discovery', exact: true })
    .click();
  await page.getByLabel('Product keyword (optional)').fill('Kitchen organiser basket');
  await page.getByRole('button', { name: 'Research product ideas', exact: true }).click();
  const card = page.locator('.opportunity-card').first();
  await expect(card.getByRole('heading', { name: 'Kitchen organiser basket' })).toBeVisible();
  await expect(card.getByText('Demo idea', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: /Add to shortlist/ }).click();
  await expect(card.getByRole('button', { name: /Remove from shortlist/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await card.getByText('Calculate costs & ad allowance', { exact: true }).click();
  await card.getByLabel('Selling price', { exact: true }).fill('1000');
  await card.getByLabel('Unit purchase cost', { exact: true }).fill('400');
  await card.getByLabel('Packaging', { exact: true }).fill('20');
  await card.getByLabel('Courier charge', { exact: true }).selectOption('120');
  await expect(card.locator('.discovery-economics')).toContainText('444.44');
  await card.getByRole('button', { name: 'Check competitor ads', exact: true }).click();
  await expect(page.getByLabel('Product keyword or advertiser name', { exact: true })).toHaveValue(
    'Kitchen organiser basket',
  );
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Product discovery', exact: true })
    .click();
  await page.getByLabel('Saved report history').selectOption({ index: 1 });
  await expect(card.getByRole('heading', { name: 'Kitchen organiser basket' })).toBeVisible();
  await card.getByRole('button', { name: 'Add actual product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Product name', { exact: true })).toHaveValue(
    'Kitchen organiser basket',
  );
  await expect(dialog.getByLabel('Description', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Actual selling price', { exact: true })).toHaveValue('');
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await card.getByRole('button', { name: 'Research this idea', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Kitchen organiser basket', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Run country research', exact: true }).click();
  await expect(page.locator('.research-readiness')).toBeVisible();
  await page.getByRole('button', { name: 'Compare real competitors', exact: true }).click();
  await expect(page.locator('#research-followup')).toHaveValue(
    /Find direct comparable competitors/,
  );
});
test('discovery fits Bangla mobile layout and exposes fixed public source links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeAttached();
  await page.getByLabel('Workspace section').selectOption('Product discovery');
  await page.getByRole('button', { name: 'বাংলায় দেখুন', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'পরবর্তী product খুঁজুন' })).toBeVisible();
  const link = page.getByRole('link', { name: /Meta Ad Library/ });
  expect(new URL(await link.getAttribute('href')).hostname).toBe('www.facebook.com');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.getByRole('button', { name: 'Product ideas research করুন' }).click();
  await expect(page.locator('.opportunity-card')).toBeVisible();
  await expect(page.getByText(/বাংলা অনুবাদ দেখছেন/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({ path: '.data/discovery-mobile-bn.png', fullPage: true });
});

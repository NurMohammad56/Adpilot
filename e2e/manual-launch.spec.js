import { test, expect } from '@playwright/test';

test('manual is the default, approvals stay manual, and the approved guide has copy, help and linking', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const errors = [],
    writes = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/execute$|\/preflight$/.test(r.url())) writes.push(r.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Generate campaign plan' }).last().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('radio', { name: /Manual guided launch/ })).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Request manual guide approval' })).toBeEnabled();
  await expect(
    dialog.getByText('Guide preview — review and approve before spending'),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy Campaign name', exact: true }).click();
  await expect(dialog.locator('.guide-copy-status')).toContainText('Copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'Bangladesh sales test',
  );
  await dialog.getByRole('button', { name: 'Help: Ad account', exact: true }).focus();
  await expect(dialog.getByRole('tooltip')).toContainText('confirm its currency');
  await dialog.getByRole('button', { name: 'Request manual guide approval' }).click();
  await dialog.getByRole('button', { name: 'Approve guide — no automatic spend' }).click();
  await expect(dialog.getByText('Approved guide — create it yourself in Facebook')).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'Open Facebook Ads Manager', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Execute approved action' })).toHaveCount(0);
  await expect(dialog.getByLabel('Meta Campaign ID', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Download guide', exact: true }).click();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('manual guide remains readable in Bangla on mobile without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.getByLabel('Workspace section').selectOption('Products');
  await page.getByRole('button', { name: 'Generate campaign plan' }).last().click();
  await page.evaluate(() => {
    localStorage.setItem('adpilot-language', 'bn');
  });
  await page.reload();
  await page.locator('.mobile-nav select').selectOption('Campaign plans');
  await page.locator('.plan-card').last().getByRole('button').first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('গাইড preview — খরচ করার আগে review ও approve করুন')).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Manual গাইড অনুমোদনের জন্য পাঠান', exact: true }),
  ).toBeEnabled();
  const sizes = await dialog.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client + 1);
});

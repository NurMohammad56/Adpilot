import { test, expect } from '@playwright/test';
test('review, revise, approve and launch a product plan through the dashboard', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your campaigns, in focus.' })).toBeVisible();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Generate campaign plan' }).last().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Research', exact: true }).click();
  await expect(dialog.getByText('AI-generated assumptions').first()).toBeVisible();
  await dialog.getByRole('button', { name: 'Creatives', exact: true }).click();
  await expect(
    dialog.getByText('Test hypothesis · conversion performance unverified').first(),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit & revalidate' }).click();
  await dialog.getByLabel('Daily budget', { exact: true }).fill('400');
  await dialog.getByRole('button', { name: 'Save new version' }).click();
  await expect(dialog.getByText('Version 2', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Request approval' }).click();
  await expect(dialog.getByRole('button', { name: 'Approve & launch' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Approve & launch' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Performance', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Desk Organizer · Bangladesh sales test' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sync insights' }).last().click();
  await expect(
    page.getByRole('status').getByText('Insights synchronized. Demo data remains simulated.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Propose change' }).last().click();
  await page.getByLabel('Change to propose').selectOption('update_targeting');
  await page
    .getByLabel('Reason and expected impact')
    .fill('Test a supported location while holding all economics and spend caps constant.');
  await page.getByRole('dialog').getByRole('button', { name: 'Request approval' }).click();
  await expect(
    page.getByRole('heading', { name: 'Exact proposed targeting change' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Approve & execute' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Audit log', exact: true }).click();
  await expect(page.getByText('execution / completed').first()).toBeVisible();
  expect(errors).toEqual([]);
});
test('responsive workspace stays usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your campaigns, in focus.' })).toBeVisible();
  await page.getByLabel('Workspace section').selectOption('Products');
  await expect(page.getByRole('heading', { name: 'Products & economics.' })).toBeVisible();
  const width = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.viewport);
});

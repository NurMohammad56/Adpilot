import { test, expect } from '@playwright/test';
async function start(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeAttached();
}
test('sidebar auto hides, opens on hover/keyboard and can be pinned; human approval stays compact', async ({
  page,
}) => {
  await start(page);
  await page.mouse.move(700, 400);
  await expect(page.locator('.sidebar')).toHaveCSS('width', '82px');
  await expect(page.locator('.control-card')).toHaveCount(0);
  await expect(page.locator('.human-approval-label')).toBeVisible();
  await page.locator('.sidebar').hover();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '270px');
  await page.mouse.move(700, 400);
  await expect(page.locator('.sidebar')).toHaveCSS('width', '82px');
  await page.getByRole('button', { name: 'Pin sidebar open', exact: true }).click();
  await expect(page.locator('.main')).toHaveCSS('margin-left', '270px');
  await page.getByRole('button', { name: 'Unpin sidebar', exact: true }).click();
  await expect(page.locator('.main')).toHaveCSS('margin-left', '82px');
  await page.getByRole('navigation').getByRole('button', { name: 'Overview', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.sidebar')).toHaveCSS('width', '270px');
  await page.mouse.move(700, 400);
  await page.locator('.page-heading h1').click();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '82px');
  await page.screenshot({ path: '.data/premium-dashboard-desktop.png' });
  await page.locator('.sidebar').hover();
  await expect(page.locator('.sidebar')).toHaveCSS('width', '270px');
  await page.screenshot({ path: '.data/premium-sidebar-expanded.png' });
});
test('digital Research studio offers Other and keeps physical briefs in Product research', async ({
  page,
}) => {
  await start(page);
  const origin = 'http://127.0.0.1:4173';
  const created = await page.request.post('/api/workspaces', {
    headers: { Origin: origin },
    data: { name: 'Premium studio QA' },
  });
  const workspace = await created.json();
  await page.request.post('/api/workspaces/switch', {
    headers: { Origin: origin },
    data: { businessId: workspace.id },
  });
  const input = {
    description: 'Investigate real buyer needs before a test.',
    buyerProfile: 'Buyers with a verifiable problem and a budget.',
    candidateCountries: ['BD'],
    productId: null,
    questions: '',
    evidence: [],
  };
  for (const [name, kind] of [
    ['Physical offer QA', 'physical-product'],
    ['Digital offer QA', 'service'],
  ]) {
    const saved = await page.request.post('/api/research', {
      headers: { Origin: origin },
      data: { ...input, name, kind },
    });
    expect(saved.ok()).toBeTruthy();
  }
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Research studio', exact: true })
    .click();
  await expect(
    page.locator('.research-project').filter({ hasText: 'Digital offer QA' }),
  ).toBeVisible();
  await expect(
    page.locator('.research-project').filter({ hasText: 'Physical offer QA' }),
  ).toHaveCount(0);
  const examples = page.getByLabel('Start with a guided example', { exact: true });
  await examples.selectOption('other');
  await expect(page.getByLabel('Offer / project name', { exact: true })).toHaveValue('');
  await expect(
    page.getByLabel('Offer type', { exact: true }).locator('option[value="physical-product"]'),
  ).toHaveCount(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Product research', exact: true })
    .click();
  await expect(
    page.locator('.research-project').filter({ hasText: 'Physical offer QA' }),
  ).toBeVisible();
  await expect(
    page.locator('.research-project').filter({ hasText: 'Digital offer QA' }),
  ).toHaveCount(0);
  await page.locator('.research-project').first().click();
  await expect(page.locator('.status-remark')).toContainText('Brief ready');
});
test('reference-inspired login/register, password visibility and Bangla mobile remain usable', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('.auth-shell')).toBeVisible();
  await page.screenshot({ path: '.data/premium-login-desktop.png' });
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await page.getByRole('button', { name: /New here/ }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await page.screenshot({ path: '.data/premium-register-desktop.png' });
  await page.setViewportSize({ width: 320, height: 844 });
  await page.getByRole('button', { name: 'বাংলায় দেখুন', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/premium-register-mobile-bn.png', fullPage: true });
});

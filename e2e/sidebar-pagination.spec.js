import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
async function start(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeAttached();
}
async function workspace(page, name) {
  await start(page);
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
async function fixtureOverview(page, transform) {
  await page.route('**/api/overview*', async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    if (response.ok()) {
      transform(value);
      value.counts = {
        pendingApprovals: value.approvals.filter((row) => row.status === 'pending').length,
        proposedOptimizations: value.optimizations.filter((row) => row.status === 'proposed')
          .length,
      };
    }
    await route.fulfill({ response, json: value });
  });
}

test('pinned labels and pending/AI badges stay painted after pointer leaves the sidebar', async ({
  page,
}) => {
  await fixtureOverview(page, (data) => {
    const template = data.approvals[0];
    data.approvals = Array.from({ length: 4 }, (_, index) => ({
      ...template,
      id: `fixture-approval-${index}`,
      status: 'pending',
    }));
    data.optimizations = Array.from({ length: 3 }, (_, index) => ({
      id: `fixture-optimization-${index}`,
      status: 'proposed',
    }));
  });
  await page.goto('/');
  const loginColor = await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.mouse.move(800, 400);
  await page.getByRole('button', { name: 'Pin sidebar open', exact: true }).click();
  await page.mouse.move(800, 400);
  const nav = page.locator('.sidebar nav'),
    approvals = nav.getByRole('button', { name: 'Approvals', exact: true }),
    optimization = nav.getByRole('button', { name: 'Optimization', exact: true });
  for (const button of [approvals, optimization]) {
    await button.scrollIntoViewIfNeeded();
    await expect(button.locator('.nav-label')).toHaveCSS('opacity', '1');
    const bounds = await button.evaluate((el) => ({
      label: el.querySelector('.nav-label').getBoundingClientRect().right,
      badge: el.querySelector('.nav-badges').getBoundingClientRect().left,
      edge: el.getBoundingClientRect().right,
      badgeRight: el.querySelector('.nav-badges').getBoundingClientRect().right,
    }));
    expect(bounds.label).toBeLessThanOrEqual(bounds.badge);
    expect(bounds.badgeRight).toBeLessThanOrEqual(bounds.edge);
  }
  await expect(approvals.locator('.nav-count')).toHaveText('4');
  await expect(optimization.locator('.nav-count')).toHaveText('3');
  await expect(optimization.locator('.ai-label')).toHaveText('AI');
  await expect(optimization.locator('.ai-label')).toHaveCSS('opacity', '1');
  expect(
    await page
      .getByRole('button', { name: 'Add product', exact: true })
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe(loginColor);
  await page.screenshot({ path: '.data/sidebar-pinned-badges-fixed.png' });
  await page.getByRole('button', { name: 'Unpin sidebar', exact: true }).click();
  await page.mouse.move(800, 400);
  await expect(page.locator('.sidebar')).toHaveCSS('width', '82px');
  await expect(optimization.locator('.ai-label')).toHaveCSS('opacity', '1');
});

test('product pagination navigates every record, changes page size and fits Bangla mobile', async ({
  page,
}) => {
  await workspace(page, 'Product paging QA');
  for (let index = 1; index <= 13; index++) {
    const response = await page.request.post('/api/products', {
      headers: { Origin: origin },
      data: {
        name: `Paging product ${String(index).padStart(2, '0')}`,
        category: 'Accessories',
        description: 'A canvas storage bag with actual pockets and handles.',
        inventory: 10,
        sellingPrice: 1500,
        minProfit: 100,
        desiredMargin: 0.2,
        dailyBudgetCeiling: 300,
        testBudgetCeiling: 2100,
        landingUrl: '',
        imageUrl: '',
        costs: {
          product: 400,
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
    expect(response.ok()).toBeTruthy();
  }
  await page.reload();
  await page.locator('.sidebar nav').getByRole('button', { name: 'Products', exact: true }).click();
  const pager = page.getByRole('navigation', { name: 'Products pagination', exact: true });
  await expect(page.locator('.product-card')).toHaveCount(6);
  await expect(pager).toContainText('1–6 of 13');
  await pager.getByRole('button', { name: 'Next page of Products' }).click();
  await expect(pager).toContainText('7–12 of 13');
  await pager.getByRole('button', { name: 'Next page of Products' }).click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(pager).toContainText('13–13 of 13');
  await pager.getByLabel('Products per page').selectOption('12');
  await expect(page.locator('.product-card')).toHaveCount(12);
  await expect(pager).toContainText('Page 1 / 2');
  await page.getByRole('button', { name: 'বাংলায় দেখুন', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('approval status filter resets a later page and keeps the matching totals accurate', async ({
  page,
}) => {
  await fixtureOverview(page, (data) => {
    const template = data.approvals[0];
    data.approvals = Array.from({ length: 24 }, (_, index) => ({
      ...template,
      id: `paging-approval-${index}`,
      status: index % 2 ? 'pending' : 'executed',
      snapshot: { ...template.snapshot, name: `Paging approval ${index}` },
    }));
  });
  await start(page);
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: 'Approvals', exact: true })
    .click();
  const pager = page.getByRole('navigation', { name: 'Approvals pagination', exact: true });
  await expect(page.locator('.approval-row')).toHaveCount(10);
  await pager.getByRole('button', { name: 'Next page of Approvals' }).click();
  await expect(pager).toContainText('Page 2 / 3');
  await page.getByLabel('Approval status filter').selectOption('pending');
  await expect(pager).toContainText('Page 1 / 2');
  await expect(pager).toContainText('1–10 of 12');
  await pager.getByRole('button', { name: 'Next page of Approvals' }).click();
  await expect(page.locator('.approval-row')).toHaveCount(2);
  await page.getByLabel('Approval status filter').selectOption('executed');
  await expect(pager).toContainText('Page 1 / 2');
});

test('ad selections remain selected across pages and keyword filtering', async ({ page }) => {
  await workspace(page, 'Saved ad paging QA');
  for (let index = 1; index <= 9; index++) {
    const saved = await page.request.post('/api/ad-library', {
      headers: { Origin: origin },
      data: {
        adUrl: String(889900000 + index),
        pageName: `Saved ad ${String(index).padStart(2, '0')}`,
        country: 'BD',
        observedAt: new Date().toISOString(),
        adCopy: 'QA saved observation, not a real product performance claim.',
      },
    });
    expect(saved.ok()).toBeTruthy();
  }
  await page.reload();
  await page.locator('.sidebar nav').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const picker = page.locator('.ad-library-picker'),
    pager = picker.getByRole('navigation', { name: 'Saved ad examples pagination', exact: true });
  await picker.getByRole('checkbox', { name: /Saved ad 09/ }).check();
  await pager.getByRole('button', { name: 'Next page of Saved ad examples' }).click();
  await picker.getByRole('checkbox', { name: /Saved ad 02/ }).check();
  await pager.getByRole('button', { name: 'Previous page of Saved ad examples' }).click();
  await expect(picker.getByRole('checkbox', { name: /Saved ad 09/ })).toBeChecked();
  await picker.getByLabel('Search saved ad examples', { exact: true }).fill('Saved ad 02');
  await expect(picker.getByRole('checkbox', { name: /Saved ad 02/ })).toBeChecked();
  await expect(picker).toContainText('2 ads selected');
});

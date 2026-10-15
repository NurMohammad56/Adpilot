import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';

test('physical product form has its own editable goal, saved facts and ad reuse; digital Offer type stays selectable', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeVisible();
  const workspace = await (
    await page.request.post('/api/workspaces', {
      headers: { Origin: origin },
      data: { name: 'Physical validation QA' },
    })
  ).json();
  await page.request.post('/api/workspaces/switch', {
    headers: { Origin: origin },
    data: { businessId: workspace.id },
  });
  const response = await page.request.post('/api/products', {
    headers: { Origin: origin },
    data: {
      name: 'Bluetooth Earbuds validation QA',
      category: 'Electronics & gadgets',
      description: 'Actual wireless earbuds with a charging case.',
      costs: {
        product: 500,
        packaging: 20,
        delivery: 80,
        paymentFixed: 0,
        paymentPercent: 0,
        other: 0,
        returnRate: 0,
        returnCost: 160,
      },
      inventory: 25,
      minProfit: 200,
      desiredMargin: 0.2,
      sellingPrice: 1500,
      landingUrl: '',
      imageUrl: '',
      dailyBudgetCeiling: 1000,
      testBudgetCeiling: 7000,
    },
  });
  expect(response.ok()).toBeTruthy();
  const product = await response.json();
  const adResponse = await page.request.post('/api/ad-library', {
    headers: { Origin: origin },
    data: {
      adUrl: '813456790',
      pageName: 'Evidence reuse shop',
      country: 'BD',
      productId: product.id,
      observedAt: new Date().toISOString(),
      adCopy: 'Owner supplied earbuds offer; performance unknown.',
    },
  });
  const ad = await adResponse.json();
  const selected = await page.request.put(`/api/products/${product.id}`, {
    headers: { Origin: origin },
    data: {
      ...Object.fromEntries(
        Object.keys(product)
          .filter(
            (key) =>
              !['id', 'businessId', 'createdAt', 'updatedAt', 'createdBy', 'revision'].includes(
                key,
              ),
          )
          .map((key) => [key, product[key]]),
      ),
      adLibraryIds: [ad.id],
    },
  });
  expect(selected.ok()).toBeTruthy();
  await page.reload();
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: 'Product research', exact: true })
    .click();
  await expect(page.getByLabel('Offer / project name', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Offer type', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Product research goal', { exact: true })).toBeEnabled();
  await page.getByLabel('Product research goal', { exact: true }).selectOption('pricing-profit');
  await page.getByLabel('Choose a saved product', { exact: true }).selectOption(product.id);
  await expect(page.getByLabel('Product name', { exact: true })).toHaveValue(product.name);
  await expect(page.getByLabel('Product details and buyer benefit', { exact: true })).toHaveValue(
    product.description,
  );
  await expect(page.getByRole('region', { name: 'Saved product facts' })).toContainText('1,500');
  await expect(page.getByRole('checkbox', { name: /Evidence reuse shop/ })).toBeChecked();
  await page.getByRole('button', { name: 'Save product research', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Validate product business potential', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'New product research', exact: true }).click();
  await page.getByLabel('Choose a saved product', { exact: true }).selectOption(product.id);
  await expect(
    page.getByRole('button', { name: 'Save product research', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Open existing product research', exact: true }).click();
  const projects = await (await page.request.get('/api/research')).json();
  expect(projects).toHaveLength(1);
  expect(projects[0].researchGoal).toBe('pricing-profit');
  expect(projects[0].buyerProfile).toContain('Buyer hypothesis not yet validated:');
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: 'Service research', exact: true })
    .click();
  await expect(page.getByLabel('Offer type', { exact: true })).toBeEnabled();
  await page.getByLabel('Offer type', { exact: true }).selectOption('software');
  await expect(page.getByLabel('Offer type', { exact: true })).toHaveValue('software');
  await expect(page.getByLabel('Product research goal', { exact: true })).toHaveCount(0);
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: 'Product research', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit brief & evidence', exact: true }).click();
  await page.locator('.language-switch').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('কোন বিষয়টি যাচাই করতে চান?', { exact: true })).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

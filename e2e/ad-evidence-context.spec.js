import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
async function start(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeVisible();
  const created = await page.request.post('/api/workspaces', {
    headers: { Origin: origin },
    data: { name: 'Ad evidence context QA' },
  });
  expect(created.ok()).toBeTruthy();
  const workspace = await created.json();
  const switched = await page.request.post('/api/workspaces/switch', {
    headers: { Origin: origin },
    data: { businessId: workspace.id },
  });
  expect(switched.ok()).toBeTruthy();
  await page.reload();
}
const observation = {
  adUrl: '765432123',
  pageName: 'Inspiration seller',
  country: 'BD',
  productId: null,
  projectId: null,
  observedAt: new Date().toISOString(),
  statusObserved: 'unknown',
  startDateObserved: '',
  adCopy: 'A product-led offer with visible terms; buyer response is not verified.',
  offer: 'No measured competitor sales.',
  landingUrl: '',
  notes: 'Saved general example for this QA workflow.',
  screenshotAssetIds: [],
};

test('general ads are selectable on product creation, changed evidence offers regeneration and Bangla translates the resulting plan', async ({
  page,
}) => {
  await start(page);
  const savedResponse = await page.request.post('/api/ad-library', {
    headers: { Origin: origin },
    data: observation,
  });
  expect(savedResponse.ok()).toBeTruthy();
  const saved = await savedResponse.json();
  await page.getByRole('navigation').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Product name', { exact: true })
    .fill('QA bag inspired by public examples');
  await dialog.getByLabel('Category / niche', { exact: true }).selectOption('Accessories');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('A real canvas bag with handles and a usable inside pocket.');
  await dialog.getByLabel('Available inventory', { exact: true }).fill('10');
  await dialog.getByLabel('Actual selling price', { exact: true }).fill('1500');
  await dialog.getByLabel('Product cost', { exact: true }).fill('500');
  await dialog.getByLabel('Packaging', { exact: true }).fill('20');
  await dialog.getByRole('checkbox', { name: /Inspiration seller/ }).check();
  await dialog.getByRole('checkbox', { name: /I reviewed the costs and assumptions/ }).check();
  await dialog.getByRole('button', { name: 'Add product', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const before = await (await page.request.get('/api/overview')).json();
  const product = before.products.find((p) => p.name.includes('QA bag'));
  expect(product.adLibraryIds).toEqual([saved.id]);
  const planned = await page.request.post(`/api/products/${product.id}/plans`, {
    headers: { Origin: origin },
    data: {},
  });
  expect(planned.ok()).toBeTruthy();
  const plan = await planned.json();
  expect(plan.research.adLibraryObservations[0].id).toBe(saved.id);
  const updated = await page.request.put(`/api/ad-library/${saved.id}`, {
    headers: { Origin: origin },
    data: {
      ...observation,
      adCopy: 'Changed message and delivery terms.',
      expectedRevision: saved.revision,
    },
  });
  expect(updated.ok()).toBeTruthy();
  await page.reload();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Ad Library research', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Reports needing fresh research and review' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Regenerate product research', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'বাংলায় দেখুন' }).click();
  await expect(page.getByText(/বাংলা অনুবাদ দেখছেন/)).toBeVisible();
  await page.getByRole('dialog').locator('.tabs button').nth(2).click();
  await expect(
    page
      .getByRole('dialog')
      .getByText(/ডেমো অনুবাদ:/)
      .first(),
  ).toBeVisible();
  const after = await (await page.request.get('/api/overview')).json();
  expect(after.plans.find((p) => p.id === plan.id).status).toBe('superseded');
  expect(after.plans.filter((p) => p.id !== plan.id)).toHaveLength(1);
  const newPlan = after.plans.find((p) => p.id !== plan.id);
  expect(newPlan.status).toBe('draft');
  expect(newPlan.research.adLibraryObservations[0].adCopy).toBe(
    'Changed message and delivery terms.',
  );
  expect(newPlan.budgetRecommendation.totalBudget).toBeGreaterThan(0);
});

test('Research studio exposes saved ad selection and translates its generated report without changing the decision', async ({
  page,
}) => {
  await start(page);
  const saved = await (
    await page.request.post('/api/ad-library', { headers: { Origin: origin }, data: observation })
  ).json();
  const projectResponse = await page.request.post('/api/research', {
    headers: { Origin: origin },
    data: {
      name: 'Service brief with competitor inspiration',
      kind: 'service',
      description: 'Build custom ecommerce for retail businesses.',
      buyerProfile: 'Retail owners with existing customers',
      candidateCountries: ['BD'],
      candidateLocationIds: [],
      productId: null,
      questions: 'Compare actual buyer problems.',
      evidence: [],
      adLibraryIds: [saved.id],
    },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = await projectResponse.json();
  const research = await page.request.post(`/api/research/${project.id}/run`, {
    headers: { Origin: origin },
    data: { instruction: '' },
  });
  expect(research.ok()).toBeTruthy();
  const version = await research.json();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Research studio', exact: true })
    .click();
  await page.getByRole('button', { name: /Service brief with competitor inspiration/ }).click();
  await expect(page.getByRole('checkbox', { name: /Inspiration seller/ })).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Ad Library research', exact: true }).last(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'বাংলায় দেখুন' }).click();
  await expect(page.getByText(/বাংলা অনুবাদ দেখছেন/)).toBeVisible();
  await expect(page.getByText(/ডেমো অনুবাদ:/).first()).toBeVisible();
  const history = await (await page.request.get(`/api/research/${project.id}/versions`)).json();
  expect(history).toHaveLength(1);
  expect(history[0].reportHash).toBe(version.reportHash);
  expect(history[0].report.recommendation).toEqual(version.report.recommendation);
  expect(history[0].status).toBe('draft');
});

import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:4173';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=',
  'base64',
);
async function start(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeAttached();
  const post = async (path, data) => {
    const response = await page.request.post('/api' + path, { headers: { Origin: origin }, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  };
  const workspace = await post('/workspaces', { name: 'Single country service QA' });
  await post('/workspaces/switch', { businessId: workspace.id });
  await page.reload();
  await page.locator('.sidebar').getByRole('button', { name: 'Services', exact: true }).click();
  return post;
}
async function add(page) {
  await page
    .locator('.tools-heading.services-heading')
    .getByRole('button', { name: 'Add service', exact: true })
    .click();
  await page.getByLabel('Service name', { exact: true }).fill('Retail integration development');
  await page.getByLabel('Service category', { exact: true }).selectOption('Ecommerce development');
  await page.getByLabel('Target country', { exact: true }).selectOption('US');
  await page
    .getByLabel('What do you offer?', { exact: true })
    .fill('Custom ecommerce development for retailers with existing integration problems.');
  await page
    .getByLabel('Who should buy this service?', { exact: true })
    .fill('Existing retail business owners with an actual integration budget and problem.');
  await page
    .getByLabel('What is included?', { exact: true })
    .fill('Discovery, an integration plan and delivery scope.');
}

test('saved service drives one-country research, explicit review and a separate campaign plan without repeated inputs', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await start(page);
  const upload = await page.request.post('/api/media', {
    headers: { Origin: origin },
    multipart: { file: { name: 'service-screen.png', mimeType: 'image/png', buffer: png } },
  });
  expect(upload.ok()).toBeTruthy();
  const asset = await upload.json();
  await add(page);
  await page
    .getByText('Campaign preferences and actual economics (optional)', { exact: true })
    .click();
  await page.getByLabel('Actual project / subscription price', { exact: true }).fill('10000');
  await page.getByLabel('Actual service delivery cost', { exact: true }).fill('4000');
  await page.getByLabel('Required profit', { exact: true }).fill('2000');
  await page.getByLabel('Measured lead-to-sale rate %', { exact: true }).fill('10');
  await page
    .getByLabel('Offer / contact page URL', { exact: true })
    .fill('https://agency.example/services');
  await page.getByLabel('Uploaded image or video', { exact: true }).selectOption(asset.id);
  await page.getByRole('button', { name: 'Save service', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Service country workspace', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'New research brief', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText('Candidate markets:', { exact: false })).toContainText(
    'United States',
  );
  const initial = await (await page.request.get('/api/services')).json();
  expect(initial).toHaveLength(1);
  const projectId = initial[0].research.id;
  await page
    .getByRole('button', { name: 'Research this service in this country', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Collect evidence before spending', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Request decision review', exact: true }).click();
  await expect(page.getByLabel('Test country', { exact: true })).toHaveCount(0);
  await page.getByLabel('Service decision', { exact: true }).selectOption('test');
  await page
    .getByLabel('Why this country / what remains uncertain?', { exact: true })
    .fill('Owner chooses a bounded US test while validating the stated evidence gaps.');
  await page
    .getByLabel('Reason for this edit', { exact: true })
    .fill('Explicit owner review for a capped validation experiment.');
  await page.getByRole('button', { name: 'Save new decision version', exact: true }).click();
  await page.getByRole('button', { name: 'Request decision review', exact: true }).click();
  await page.getByRole('button', { name: 'Approve research decision', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare campaign draft', exact: true }).click();
  await expect(page.getByLabel('HTTPS offer / contact page', { exact: true })).toHaveValue(
    'https://agency.example/services',
  );
  await expect(
    page.getByLabel('Price per sale / project (leave empty if unknown)', { exact: true }),
  ).toHaveValue('10000');
  await expect(page.getByLabel('Uploaded image or video', { exact: true }).last()).toHaveValue(
    asset.id,
  );
  await page.getByLabel('Daily test budget', { exact: true }).fill('200');
  await page.getByLabel('Test duration in days', { exact: true }).fill('5');
  await page
    .getByRole('checkbox', {
      name: 'I understand this is a small test and results are not guaranteed.',
    })
    .check();
  await page
    .getByRole('button', { name: 'Generate campaign draft for review', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const overview = await (await page.request.get('/api/overview')).json();
  const plan = overview.plans.find((plan) => plan.serviceProfileId === initial[0].id);
  expect(plan.market).toBe('US');
  expect(plan.status).toBe('draft');
  expect(overview.campaigns).toHaveLength(0);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Service country workspace', exact: true }),
  ).toBeVisible();
  const after = await (await page.request.get('/api/services')).json();
  expect(after[0].research.id).toBe(projectId);
  expect(after).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('service facts feed the separate comparison workspace and saved services fit Bangla mobile', async ({
  page,
}) => {
  await start(page);
  await add(page);
  await page.getByRole('button', { name: 'Save service', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Service country workspace', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Compare other countries', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Service research', exact: true })).toBeVisible();
  await expect(page.getByLabel('Offer / project name', { exact: true })).toHaveValue(
    'Retail integration development',
  );
  await expect(page.getByLabel('Who should buy it?', { exact: true })).toHaveValue(
    /Existing retail business owners/,
  );
  await page.getByLabel('United Kingdom', { exact: true }).check();
  await page.getByRole('button', { name: 'Save research brief', exact: true }).click();
  const projects = await (await page.request.get('/api/research')).json();
  expect(
    projects.some(
      (project) =>
        project.researchMode === 'single-country-service' &&
        project.candidateCountries.length === 1,
    ),
  ).toBeTruthy();
  expect(
    projects.some(
      (project) =>
        project.researchMode === 'market-comparison' && project.candidateCountries.length === 2,
    ),
  ).toBeTruthy();
  await page.locator('.sidebar').hover();
  await page.locator('.sidebar').getByRole('button', { name: 'Services', exact: true }).click();
  await page.getByRole('button', { name: 'Back to services', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.language-switch').click();
  await expect(page.getByRole('heading', { name: 'সার্ভিসসমূহ', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/services-mobile-bn.png', fullPage: true });
});

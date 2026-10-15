import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const origin = 'http://127.0.0.1:4173';
const nav = async (page, name) => {
  await page.locator('.sidebar').hover();
  await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
};
async function workspace(page, name) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeVisible();
  const response = await page.request.post('/api/workspaces', {
    headers: { Origin: origin },
    data: { name },
  });
  expect(response.ok()).toBeTruthy();
  const business = await response.json();
  await page.request.post('/api/workspaces/switch', {
    headers: { Origin: origin },
    data: { businessId: business.id },
  });
  await page.reload();
  return business;
}
test('health and usage policy are understandable, persistent and usable on Bangla mobile without paid AI calls', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await workspace(page, 'Operations policy QA');
  await nav(page, 'Settings');
  await expect(
    page.getByRole('heading', { name: 'System health & AI usage', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Enable automatic refresh of due product research (uses AI allowance)'),
  ).not.toBeChecked();
  await page.getByLabel('AI requests per day', { exact: true }).fill('7');
  await page.getByRole('button', { name: 'Save usage policy', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/operations/usage')).json()).policy.dailyRequests,
    )
    .toBe(7);
  await page.reload();
  await expect(page.getByLabel('AI requests per day', { exact: true })).toHaveValue('7');
  expect((await page.request.get('/api/data/products?limit=101')).status()).toBe(422);
  await page.locator('.language-switch').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.operations-panel h2')).toContainText(/[ঀ-৿]/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.locator('.operations-panel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: '.data/operations-mobile-bn.png' });
  expect(errors).toEqual([]);
});
test('queued research status survives page reload and completed result opens automatically in the selected brief', async ({
  page,
}) => {
  const business = await workspace(page, 'Background research QA');
  const response = await page.request.post('/api/research', {
    headers: { Origin: origin },
    data: {
      name: 'Website design queue QA',
      kind: 'service',
      description: 'Custom business website design for established small businesses.',
      buyerProfile: 'Existing businesses needing a custom website, not measured demand.',
      candidateCountries: ['GB'],
      questions: 'Compare competitor services and what to validate before a small test.',
      evidence: [],
    },
  });
  expect(response.ok()).toBeTruthy();
  const project = await response.json();
  await page.evaluate(
    ({ id, businessId }) => sessionStorage.setItem(`adpilot-research-selection:${businessId}`, id),
    { id: project.id, businessId: business.id },
  );
  let polls = 0,
    completed = false;
  const job = {
    id: randomUUID(),
    businessId: business.id,
    type: 'research-task',
    kind: 'research',
    targetId: project.id,
    status: 'queued',
    stage: 'waiting',
    progress: 0,
    createdAt: new Date().toISOString(),
  };
  await page.route(`**/api/research/${project.id}/run`, (route) =>
    route.fulfill({ status: 202, json: { queued: true, job } }),
  );
  await page.route('**/api/overview?compact=true', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    data.jobs = [
      {
        ...job,
        status: completed ? 'completed' : 'running',
        stage: completed ? 'completed' : 'collecting-evidence',
        progress: completed ? 100 : 15,
      },
    ];
    await route.fulfill({ json: data });
  });
  await page.route('**/api/data/jobs?limit=20', async (route) => {
    polls++;
    if (polls >= 3 && !completed) {
      const generated = await page.request.post(`/api/research/${project.id}/run`, {
        headers: { Origin: origin },
        data: { instruction: '', fresh: false },
      });
      expect(generated.ok()).toBeTruthy();
      completed = true;
    }
    await route.fulfill({
      json: {
        items: [
          {
            ...job,
            status: completed ? 'completed' : 'running',
            stage: completed ? 'completed' : 'collecting-evidence',
            progress: completed ? 100 : 15,
          },
        ],
        total: 1,
        nextCursor: null,
      },
    });
  });
  await page.reload();
  await nav(page, 'Service research');
  await page
    .locator('.research-record-item .research-project')
    .filter({ hasText: 'Website design queue QA' })
    .click();
  await page.getByRole('button', { name: 'Run country research', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Background research' })
      .or(page.locator('section[aria-label="Background research"]')),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator('section[aria-label="Background research"]')).toBeVisible();
  await expect.poll(() => completed, { timeout: 20000 }).toBeTruthy();
  await expect(page.getByText('Version history', { exact: true })).toBeVisible({ timeout: 15000 });
});

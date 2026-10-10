import { test, expect } from '@playwright/test';

for (const status of ['failed', 'needs_reconciliation']) {
  test(`a ${status} execution refreshes approval state and removes the stale Execute button`, async ({
    page,
  }) => {
    let executionId,
      writes = 0;
    const message = 'The campaign spending limit must be at least BDT7,900.00 for this currency.';
    await page.route('**/api/approvals/*/execute', async (route) => {
      executionId = route.request().url().split('/').at(-2);
      writes++;
      await route.fulfill({
        status: 502,
        json: {
          error: { code: 'META_REJECTED', message, details: { metaCode: 100, subcode: 2446307 } },
        },
      });
    });
    await page.route('**/api/overview', async (route) => {
      const response = await route.fetch(),
        data = await response.json();
      if (executionId) {
        const approval = data.approvals.find((row) => row.id === executionId);
        approval.status = status;
        approval.executionError = { message, metaCode: 100, subcode: 2446307 };
        if (status === 'failed')
          data.plans.find((row) => row.id === approval.planId).status = 'failed';
      }
      await route.fulfill({ response, json: data });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Explore demo workspace' }).click();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Products', exact: true })
      .click();
    await page.getByRole('button', { name: 'Generate campaign plan' }).last().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Request approval', exact: true }).click();
    await dialog.getByRole('button', { name: 'Approve & launch', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText(
      status === 'failed' ? 'Campaign was not created' : 'Execution needs verification',
    );
    await expect(dialog.getByRole('alert')).toContainText(message);
    await expect(
      dialog.getByRole('button', { name: /Execute approved action|Approve & launch/ }),
    ).toHaveCount(0);
    await expect(page.locator('.toast[role="alert"]')).toContainText(message);
    expect(writes).toBe(1);
  });
}

test('a development-mode launch check explains the Meta setting and blocks requesting approval', async ({
  page,
}) => {
  let check,
    approvalWrites = 0;
  const message =
    'Ads creative post was created by an app that is in development mode. It must be in public to create this ad.';
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/submit$|\/execute$|\/decision$/.test(request.url()))
      approvalWrites++;
  });
  await page.route('**/api/overview', async (route) => {
    const response = await route.fetch(),
      data = await response.json();
    data.mode = 'live';
    data.launchChecks = check ? [check] : [];
    await route.fulfill({ response, json: data });
  });
  await page.route('**/api/plans/*/preflight', async (route) => {
    const planId = route.request().url().split('/').at(-2);
    const data = await (await page.request.get('/api/overview')).json();
    check = {
      id: 'launch-check',
      planId,
      fingerprint: data.plans.find((p) => p.id === planId).fingerprint,
      checkedAt: new Date().toISOString(),
      ok: false,
      demo: false,
      issue: { message, subcode: 1885183, metaCode: 100 },
    };
    await route.fulfill({ json: check });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Generate campaign plan' }).last().click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: 'Request approval', exact: true }),
  ).toBeDisabled();
  await dialog.getByRole('button', { name: 'Check Meta launch readiness', exact: true }).click();
  await expect(dialog.getByText(`Launch blocked: ${message}`, { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('link', { name: 'Open Meta Developer Apps', exact: true }),
  ).toHaveAttribute('href', 'https://developers.facebook.com/apps/');
  await expect(
    dialog.getByRole('button', { name: 'Request approval', exact: true }),
  ).toBeDisabled();
  expect(approvalWrites).toBe(0);
});

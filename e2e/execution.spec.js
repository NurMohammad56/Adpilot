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

import { test, expect } from '@playwright/test';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=',
  'base64',
);
test('own workspace, real image/video uploads, iterative country research and separately approved service campaign', async ({
  page,
}) => {
  const errors = [];
  await page.route('**/api/campaigns/budget-preset', (route) =>
    route.fulfill({
      json: {
        currency: 'BDT',
        available: true,
        usdDaily: 3,
        dailyBudget: 369.03,
        durationDays: 7,
        totalBudget: 2583.21,
        rate: 123.012003,
        rateUpdatedAt: '2026-10-08T00:02:31Z',
        source: 'https://www.exchangerate-api.com',
      },
    }),
  );
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  const original = await page.locator('.workspace-switch strong').innerText();
  await page.getByRole('navigation').getByRole('button', { name: 'Accounts', exact: true }).click();
  await page.getByLabel('New workspace name', { exact: true }).fill('Service client QA');
  await page.getByRole('button', { name: 'Create separate workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toHaveText('Service client QA');
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await page
    .getByLabel('Media file', { exact: true })
    .setInputFiles({ name: 'agency-cover.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Upload file' }).click();
  await expect(page.getByText('agency-cover.png', { exact: true })).toBeVisible();
  const video = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#416c47';
    ctx.fillRect(0, 0, 160, 90);
    const stream = canvas.captureStream(5);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
    const chunks = [];
    const blob = await new Promise((resolve) => {
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      recorder.start();
      setTimeout(() => {
        recorder.stop();
        stream.getTracks().forEach((track) => track.stop());
      }, 400);
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await page.getByLabel('Media file', { exact: true }).setInputFiles({
    name: 'agency-demo.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from(video),
  });
  await page.getByRole('button', { name: 'Upload file' }).click();
  await expect(page.getByText('agency-demo.webm', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Research studio', exact: true }).click();
  await page.getByLabel('Offer / project name', { exact: true }).fill('Custom ecommerce QA');
  await page
    .getByLabel('What do you sell, and what problem does it solve?', { exact: true })
    .fill(
      'Custom ecommerce development for established retail businesses that need a tailored online store.',
    );
  await page
    .getByLabel('Who should buy it?', { exact: true })
    .fill('Owners of established small and medium retail businesses.');
  await page.getByLabel('Location country', { exact: true }).selectOption('US');
  await page.getByLabel('Search a state, region or city', { exact: true }).fill('California');
  await page.getByRole('button', { name: 'Search Meta locations', exact: true }).click();
  await page.getByLabel('Add California', { exact: true }).check();
  await page.getByRole('button', { name: 'Save research brief' }).click();
  await page.getByRole('button', { name: 'Run country research' }).click();
  await expect(
    page.getByRole('heading', { name: 'Research version 1', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'State & region comparison', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Discuss / research further', { exact: true })
    .fill('Compare US and UK sales barriers and explain which evidence would change the decision.');
  await page.getByRole('button', { name: 'Research again with this question' }).click();
  await expect(
    page.getByRole('heading', { name: 'Research version 2', exact: true }),
  ).toBeVisible();
  const reviewRequests = [];
  page.on('request', (req) => {
    if (
      req.method() === 'POST' &&
      /\/research\/versions\/[^/]+\/submit$/.test(new URL(req.url()).pathname)
    )
      reviewRequests.push(req.url());
  });
  await expect(page.getByRole('heading', { name: 'No country selected yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request decision review' })).toBeEnabled();
  await page.getByRole('button', { name: 'Request decision review' }).click();
  await expect(page.getByLabel('Test country', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Test country', { exact: true })).toBeFocused();
  await expect(page.locator('#research-review-guidance')).toBeVisible();
  expect(reviewRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No country selected yet' })).toBeVisible();
  await page.getByRole('button', { name: 'Request decision review' }).click();
  await page.getByLabel('Test country', { exact: true }).selectOption('US');
  await page.getByLabel('Target California', { exact: true }).check();
  await page
    .getByLabel('Why this country / what remains uncertain?', { exact: true })
    .fill(
      'Choose a capped US test to learn about client fit; no acquisition performance is assumed.',
    );
  await page
    .getByLabel('Reason for this edit', { exact: true })
    .fill('Select a test country after reviewing the evidence limitations.');
  await page.getByRole('button', { name: 'Save new decision version' }).click();
  await expect(
    page.getByRole('heading', { name: 'Research version 3', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Request decision review' }).click();
  expect(reviewRequests).toHaveLength(1);
  await page.getByRole('button', { name: 'Approve research decision', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare campaign draft' }).click();
  await expect(page.getByRole('heading', { name: 'Easy campaign setup' })).toBeVisible();
  await expect(page.locator('.campaign-context').first()).toContainText('California');
  await expect(page.getByLabel('Daily test budget', { exact: true })).toHaveValue('369.03');
  await expect(page.getByLabel('Test duration in days', { exact: true })).toHaveValue('7');
  await expect(
    page.getByLabel('Price per sale / project (leave empty if unknown)', { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.campaign-budget-summary')).toContainText('2,583.21 BDT');
  const goalHelp = page.getByRole('button', { name: 'Help: Campaign goal', exact: true });
  await goalHelp.hover();
  await expect(page.getByRole('tooltip')).toContainText('For a client service');
  await goalHelp.click();
  await goalHelp.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.language-switch').click();
  await page.getByRole('button', { name: 'সহায়তা: ক্যাম্পেইনের লক্ষ্য', exact: true }).click();
  await expect(page.getByRole('tooltip')).toContainText('ক্লায়েন্টের জন্য সার্ভিস');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.locator('.language-switch').click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByLabel('Do you know your project price and costs?', { exact: true })
    .selectOption('known');
  await page.getByRole('button', { name: 'Adjust spending ceiling' }).click();
  await page
    .getByLabel('HTTPS offer / contact page', { exact: true })
    .fill('https://example.com/custom-ecommerce');
  await page
    .getByLabel('Price per sale / project (leave empty if unknown)', { exact: true })
    .fill('20000');
  await page.getByLabel('Actual service delivery cost', { exact: true }).fill('10000');
  await page.getByLabel('Required profit per sale / project', { exact: true }).fill('4000');
  await page.getByLabel('Measured lead-to-sale rate % (optional)', { exact: true }).fill('10');
  await page
    .getByLabel('I understand this is a small test and results are not guaranteed.', {
      exact: true,
    })
    .check();
  await page
    .getByLabel('Uploaded image or video', { exact: true })
    .selectOption({ label: 'agency-demo.webm · video' });
  await page
    .getByLabel('Video cover image', { exact: true })
    .selectOption({ label: 'agency-cover.png' });
  await page.getByRole('button', { name: 'Generate campaign draft for review' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('US · Meta · Website leads', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Creatives', exact: true }).click();
  await expect(dialog.locator('video')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Edit & revalidate' }).click();
  await dialog
    .getByLabel('Uploaded image or video', { exact: true })
    .selectOption({ label: 'agency-cover.png · image' });
  await dialog.getByRole('button', { name: 'Save new version' }).click();
  await expect(dialog.getByText('Version 2', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Request approval', exact: true }).click();
  await dialog.getByRole('button', { name: 'Approve & launch' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Ad control center', exact: true }).click();
  await page.getByLabel('Outcome campaign', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Order / enquiry reference', { exact: true }).fill('CLIENT-QA-001');
  await page.getByLabel('Outcome status', { exact: true }).selectOption('qualified');
  await page
    .getByLabel('Outcome evidence / source', { exact: true })
    .fill('Qualified buyer interview log QA 001');
  await page.getByRole('button', { name: 'Save customer outcome', exact: true }).click();
  await expect(page.getByText('CLIENT-QA-001', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit outcome', exact: true }).click();
  await page.getByLabel('Outcome status', { exact: true }).selectOption('won');
  await page.getByLabel('Payment received', { exact: true }).fill('5000');
  await page.getByLabel('Actual incurred cost (optional)', { exact: true }).fill('1000');
  await page.getByRole('button', { name: 'Save customer outcome', exact: true }).click();
  await expect(page.getByText('CLIENT-QA-001', { exact: true })).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export outcomes CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('adpilot-outcomes.csv');
  await page.getByRole('button', { name: 'Meta account & delivery', exact: true }).click();
  await page.getByRole('button', { name: 'Check Meta account & delivery', exact: true }).click();
  await expect(
    page.getByText('This is a demo account. No real delivery data is shown.', { exact: true }),
  ).toBeVisible();
  let releaseCheck;
  await page.route('**/api/operations/account/check', async (route) => {
    await new Promise((resolve) => {
      releaseCheck = resolve;
    });
    await route.continue();
  });
  await page.getByRole('button', { name: 'Check Meta account & delivery', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Check Meta account & delivery', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('navigation')
    .getByRole('button', { name: 'Research studio', exact: true })
    .click();
  const researchProject = page
    .locator('.research-project')
    .filter({ hasText: 'Custom ecommerce QA' });
  await expect(researchProject).toBeDisabled();
  await expect.poll(() => Boolean(releaseCheck)).toBeTruthy();
  releaseCheck();
  await expect(researchProject).toBeEnabled();
  await researchProject.click();
  await expect(
    page.getByRole('button', { name: 'Prepare campaign draft', exact: true }),
  ).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Accounts', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(original) }).click();
  await expect(page.locator('.workspace-switch strong')).toHaveText(original);
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await expect(page.getByText('agency-cover.png', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Research studio', exact: true }).click();
  await expect(page.getByRole('button', { name: /Custom ecommerce QA/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('research, media and account pages fit a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  for (const section of ['Accounts', 'Media library', 'Research studio', 'Ad control center']) {
    await page.getByLabel('Workspace section', { exact: true }).selectOption(section);
    await expect(
      page.getByRole('heading', {
        name: section === 'Accounts' ? 'Accounts & workspaces' : section,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBeTruthy();
  }
  await page.locator('.language-switch').click();
  await expect(
    page.getByRole('heading', { name: 'বিজ্ঞাপন নিয়ন্ত্রণ কেন্দ্র', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});

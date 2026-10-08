import { test, expect } from '@playwright/test';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=',
  'base64',
);
test('own workspace, real image/video uploads, iterative country research and separately approved service campaign', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  const original = await page.locator('.workspace-switch strong').innerText();
  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
  await page.getByLabel('New workspace name').fill('Service client QA');
  await page.getByRole('button', { name: 'Create separate workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toHaveText('Service client QA');
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await page
    .getByLabel('Media file')
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
  await page.getByLabel('Media file').setInputFiles({
    name: 'agency-demo.webm',
    mimeType: 'video/webm',
    buffer: Buffer.from(video),
  });
  await page.getByRole('button', { name: 'Upload file' }).click();
  await expect(page.getByText('agency-demo.webm', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Research studio', exact: true }).click();
  await page.getByLabel('Offer / project name').fill('Custom ecommerce QA');
  await page
    .getByLabel('What do you sell, and what problem does it solve?')
    .fill(
      'Custom ecommerce development for established retail businesses that need a tailored online store.',
    );
  await page
    .getByLabel('Who should buy it?')
    .fill('Owners of established small and medium retail businesses.');
  await page.getByRole('button', { name: 'Save research brief' }).click();
  await page.getByRole('button', { name: 'Run country research' }).click();
  await expect(
    page.getByRole('heading', { name: 'Research version 1', exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Discuss / research further')
    .fill('Compare US and UK sales barriers and explain which evidence would change the decision.');
  await page.getByRole('button', { name: 'Research again with this question' }).click();
  await expect(
    page.getByRole('heading', { name: 'Research version 2', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit decision in a new version' }).click();
  await page.getByLabel('Test country', { exact: true }).selectOption('US');
  await page
    .getByLabel('Why this country / what remains uncertain?')
    .fill(
      'Choose a capped US test to learn about client fit; no acquisition performance is assumed.',
    );
  await page
    .getByLabel('Reason for this edit')
    .fill('Select a test country after reviewing the evidence limitations.');
  await page.getByRole('button', { name: 'Save new decision version' }).click();
  await expect(
    page.getByRole('heading', { name: 'Research version 3', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Request decision review' }).click();
  await page.getByRole('button', { name: 'Approve research decision', exact: true }).click();
  await page.getByRole('button', { name: 'Prepare campaign draft' }).click();
  await page.getByLabel('HTTPS offer / contact page').fill('https://example.com/custom-ecommerce');
  await page.getByLabel('Price per sale / project (leave empty if unknown)').fill('20000');
  await page.getByLabel('Actual service delivery cost').fill('10000');
  await page.getByLabel('Required profit per sale / project').fill('4000');
  await page.getByLabel('Measured lead-to-sale rate % (optional)').fill('10');
  await page
    .getByLabel('Uploaded image or video')
    .selectOption({ label: 'agency-demo.webm · video' });
  await page.getByLabel('Video cover image').selectOption({ label: 'agency-cover.png' });
  await page.getByRole('button', { name: 'Generate campaign draft for review' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('US · Meta · Website leads', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Creatives', exact: true }).click();
  await expect(dialog.locator('video')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Edit & revalidate' }).click();
  await dialog
    .getByLabel('Uploaded image or video')
    .selectOption({ label: 'agency-cover.png · image' });
  await dialog.getByRole('button', { name: 'Save new version' }).click();
  await expect(dialog.getByText('Version 2', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Request approval', exact: true }).click();
  await dialog.getByRole('button', { name: 'Approve & launch' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
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
  for (const section of ['Accounts', 'Media library', 'Research studio']) {
    await page.getByLabel('Workspace section').selectOption(section);
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
});

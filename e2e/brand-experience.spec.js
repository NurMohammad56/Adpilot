import { test, expect } from '@playwright/test';

test('brand assets load, navigation stays usable and reduced motion is respected', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const logo = page.locator('.login-story .brand .brand-symbol');
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img) => img.complete && img.naturalWidth > 0)).toBe(true);
  for (const href of await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) => links.map((link) => link.href))) {
    const asset = await page.request.get(href);
    expect(asset.ok()).toBeTruthy();
    expect(asset.headers()['content-type']).toMatch(/^image\//);
  }
  await page.screenshot({ path: '.data/brand-login-desktop.png' });
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeAttached();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#workspace-content')).toBeFocused();
  await page.getByRole('button', { name: 'Pin sidebar open', exact: true }).click();
  await page.mouse.move(700, 400);
  await expect(page.locator('.sidebar-brand-name')).toBeVisible();
  await expect(page.locator('.sidebar .nav-label').filter({ hasText: 'Overview' })).toHaveCSS(
    'opacity',
    '1',
  );
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.screenshot({ path: '.data/brand-dashboard-desktop.png' });
  for (const name of [
    'Products',
    'Product research',
    'Research studio',
    'Ad Library research',
    'Settings',
  ]) {
    await page.locator('.sidebar').getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.page-content')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This section could not load' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.sidebar')).toHaveCSS('transition-duration', '0s');
  await page.locator('.sidebar').getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Add product', exact: true }).first().click();
  await expect(page.locator('.modal')).toHaveCSS('animation-name', 'none');
  await page.screenshot({ path: '.data/brand-product-desktop.png' });
  expect(errors).toEqual([]);
});

test('Bangla login and workspace fit small screens with loaded branding', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/');
  await page.locator('.language-switch').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.locator('.auth-mobile-brand .brand-symbol')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/brand-login-mobile-bn.png', fullPage: true });
  await page.locator('.language-switch').click();
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await expect(page.locator('.workspace-switch strong')).toBeAttached();
  await page.locator('.language-switch').click();
  for (const value of [
    'Overview',
    'Products',
    'Product research',
    'Research studio',
    'Ad Library research',
    'Settings',
  ]) {
    await page.locator('.mobile-nav select').selectOption(value);
    await expect(page.locator('.page-content')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.screenshot({ path: '.data/brand-settings-mobile-bn.png', fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(page.locator('.mobile-nav select')).toBeVisible();
  await expect(page.locator('.mobile-brand .brand-symbol')).toBeVisible();
  await page.locator('.mobile-nav select').selectOption('Overview');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.data/brand-dashboard-tablet-bn.png', fullPage: true });
});

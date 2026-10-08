import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
await fs.mkdir('.data/previews', { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
try {
  await page.goto('http://localhost:4000');
  await page.getByRole('button', { name: 'Explore demo workspace' }).click();
  await page.getByRole('heading', { name: 'Your campaigns, in focus.' }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: '.data/previews/desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.data/previews/mobile.png', fullPage: true });
  console.log('Saved desktop/mobile previews in .data/previews');
} finally {
  await browser.close();
}

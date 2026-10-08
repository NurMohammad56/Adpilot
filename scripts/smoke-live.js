import 'dotenv/config';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = process.env.APP_ORIGIN;
assert(
  ['localhost', '127.0.0.1'].includes(new URL(origin).hostname),
  'This check is for the local workspace only',
);
const credentials = await fs.readFile('.data/initial-admin.txt', 'utf8');
const email = credentials.match(/^Email: (.+)$/m)?.[1];
const password = credentials.match(/^Password: (.+)$/m)?.[1];
assert(email && password, 'Local administrator credentials are missing');
let cookie;
async function request(path, method = 'GET', body) {
  const result = await fetch(`${origin}/api${path}`, {
    method,
    headers: {
      Origin: origin,
      'content-type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (result.headers.has('set-cookie')) cookie = result.headers.get('set-cookie').split(';')[0];
  const value = await result.json();
  assert(result.ok, `Local API check failed: ${path} (${value.error?.code || result.status})`);
  return value;
}
const health = await request('/health');
assert.equal(health.mode, 'live');
assert.equal(health.liveExecutionEnabled, false);
await request('/auth/login', 'POST', { email, password });
const overview = await request('/overview');
assert.equal(overview.integration.configured, true);
assert.equal(overview.integration.encryptedToken, undefined);
assert.equal(overview.integration.encryptedAppSecret, undefined);
assert.equal(overview.aiIntegration.configured, true);
assert.equal(overview.aiIntegration.encryptedKey, undefined);
const workspaces = await request('/workspaces');
assert.ok(
  workspaces.some((workspace) => workspace.id === overview.business.id && workspace.active),
);
assert.ok(Array.isArray(await request('/media')));
assert.ok(Array.isArray(await request('/research')));
const countries = await request('/research/countries');
assert.equal(Object.keys(countries).length, 35);
for (const key of [
  'META_ACCESS_TOKEN',
  'META_EXPLORER_TOKEN',
  'META_LIVE_ACCESS_TOKEN',
  'LLM_API_KEY',
  'META_APP_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'MCP_SERVICE_KEY',
])
  if (process.env[key])
    assert(
      !JSON.stringify(overview).includes(process.env[key]),
      'Secret appeared in the public response',
    );
const locations = await request('/integrations/meta/targeting?q=Dhaka&type=city');
const dhaka = locations.find((item) => item.name === 'Dhaka' && item.country_code === 'BD');
if (dhaka && !overview.integration.locationMap?.Dhaka)
  await request('/integrations/meta/locations', 'POST', {
    name: 'Dhaka',
    key: String(dhaka.key),
    type: 'city',
  });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(origin);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('PLANNING WORKSPACE', { exact: true }).waitFor();
  await page.screenshot({ path: '.data/live-workspace.png', fullPage: true });
  await page.getByRole('button', { name: 'Accounts', exact: true }).click();
  await page.getByRole('heading', { name: 'Accounts & workspaces' }).waitFor();
  await page.screenshot({ path: '.data/live-accounts.png', fullPage: true });
  await page.getByRole('button', { name: 'Media library', exact: true }).click();
  await page.getByRole('heading', { name: 'Media library', exact: true }).waitFor();
  await page.getByLabel('Media file').waitFor();
  await page.getByRole('button', { name: 'Research studio', exact: true }).click();
  await page.getByRole('heading', { name: 'Research studio' }).waitFor();
  await page.screenshot({ path: '.data/live-research.png', fullPage: true });
} finally {
  await browser.close();
}
const report = {
  ok: true,
  checkedAt: new Date().toISOString(),
  mode: health.mode,
  backgroundJobsEnabled: health.backgroundJobsEnabled,
  liveExecutionEnabled: false,
  adminLogin: true,
  liveMetaRead: true,
  dhakaLocationResolved: Boolean(dhaka),
  secretDisclosureCheck: 'passed',
  browserLogin: 'passed',
  workspaceMediaResearchAPI: 'passed',
  newInterfaceSections: 'passed',
  screenshot: '.data/live-workspace.png',
  advertisingWritesAttempted: false,
};
await fs.writeFile('.data/live-status.json', JSON.stringify(report, null, 2));
await request('/auth/logout', 'POST', {});
console.log(JSON.stringify(report, null, 2));

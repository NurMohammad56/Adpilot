import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { loadConfig } from '../src/config/index.js';
import { createStore } from '../src/db/store.js';
import { AuthService } from '../src/modules/auth/service.js';
import { Platform } from '../src/modules/platform.js';
import { LLMService } from '../src/ai/provider.js';
import { LiveMetaAdapter } from '../src/integrations/meta/adapter.js';
import { seal, unseal } from '../src/utils/core.js';

// Prepare database independently of the worker; never execute a campaign.
const config = { ...loadConfig(), mode: 'live', liveExecution: false };
const report = JSON.parse(await fs.readFile('.data/connection-status.json', 'utf8'));
const pixelId = process.env.META_PIXEL_ID;
const entries = [
  ['metaExplorer', process.env.META_LIVE_ACCESS_TOKEN || process.env.META_EXPLORER_TOKEN],
  ['metaMarketing', process.env.META_ACCESS_TOKEN],
];
const matches = entries.flatMap(([name, token]) =>
  (report.connections[name]?.adAccounts?.accounts || [])
    .filter(
      (account) =>
        account.currency === 'BDT' &&
        account.account_status === 1 &&
        account.pixels?.pixels?.some((pixel) => pixel.id === pixelId),
    )
    .map((account) => ({ name, token, account })),
);
if (!matches.length)
  throw new Error(
    'No active BDT account has access to the supplied pixel. Run check-connections first.',
  );
const selected = process.env.META_AD_ACCOUNT_ID
  ? matches.find(
      (match) =>
        match.account.id.replace(/^act_/, '') ===
        process.env.META_AD_ACCOUNT_ID.replace(/^act_/, ''),
    )
  : matches.length === 1
    ? matches[0]
    : null;
if (!selected) throw new Error('Set META_AD_ACCOUNT_ID to select the verified account.');
const pages = report.connections[selected.name].pages?.pages || [];
const page = process.env.META_PAGE_ID
  ? pages.find((page) => page.id === process.env.META_PAGE_ID)
  : pages.length === 1
    ? pages[0]
    : null;
if (!page) throw new Error('Set META_PAGE_ID to the intended accessible Facebook Page.');
const store = await createStore(config);
try {
  const auth = new AuthService(store);
  const email = process.env.ADMIN_EMAIL || 'admin@adpilot.local';
  let user = await store.find('users', { email });
  await fs.mkdir('.data', { recursive: true });
  if (!user) {
    const password = crypto.randomBytes(24).toString('base64url');
    // Save before writing the database so failure cannot discard the only password.
    await fs.writeFile(
      '.data/initial-admin.txt',
      `AdPilot live workspace administrator\nEmail: ${email}\nPassword: ${password}\nLogin after live API startup at http://localhost:4000\nKeep this file private.\n`,
      { mode: 0o600, flag: 'wx' },
    );
    user = await auth.register({
      name: 'Workspace Administrator',
      email,
      password,
      businessName: page.name,
    });
  }
  const platform = new Platform(store, config, new LLMService(config), new LiveMetaAdapter(config));
  const existing = await platform.integration(user.businessId);
  if (
    existing &&
    existing.adAccountId === selected.account.id.replace(/^act_/, '') &&
    unseal(existing.encryptedToken, config.encryptionKey) !== selected.token
  ) {
    await platform.meta.verify({
      ...existing,
      encryptedToken: seal(selected.token, config.encryptionKey),
    });
    await store.transaction(async () => {
      await store.update('integrations', existing.id, {
        encryptedToken: seal(selected.token, config.encryptionKey),
        tokenExpiresAt: process.env.META_TOKEN_EXPIRES_AT,
        verifiedAt: new Date().toISOString(),
      });
      await platform.audit(user, 'integration.token_updated', existing.id, {
        expiresAt: process.env.META_TOKEN_EXPIRES_AT,
      });
    });
  }
  const integration =
    existing ||
    (await platform.configureMeta(user, {
      adAccountId: selected.account.id,
      pageId: page.id,
      pixelId,
      accessToken: selected.token,
    }));
  const check = await platform.meta.verify(await platform.integration(user.businessId));
  const savedMeta = await platform.integration(user.businessId);
  if (process.env.META_APP_SECRET && !savedMeta.encryptedAppSecret)
    await store.update('integrations', savedMeta.id, {
      encryptedAppSecret: seal(process.env.META_APP_SECRET, config.encryptionKey),
    });
  if (
    !(await store.find('integrations', { businessId: user.businessId, provider: 'AI' })) &&
    process.env.LLM_API_KEY
  )
    await platform.configureAI(user, {
      provider: process.env.LLM_PROVIDER,
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL,
      grounding: process.env.GEMINI_SEARCH_GROUNDING === 'true',
    });
  console.log(
    JSON.stringify(
      {
        ok: true,
        database: 'bd_ads',
        adminEmail: email,
        loginFile: '.data/initial-admin.txt',
        businessId: user.businessId,
        accountName: check.name,
        accountId: integration.adAccountId,
        pageName: check.pageName,
        pageId: integration.pageId,
        pixelId,
        currency: check.currency,
        tokenEncryptedAtRest: true,
        advertisingWritesAttempted: false,
      },
      null,
      2,
    ),
  );
} finally {
  await store.close();
}

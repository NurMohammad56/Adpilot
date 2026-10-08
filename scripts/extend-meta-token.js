import 'dotenv/config';
import fs from 'node:fs/promises';

// Server-only OAuth exchange; no token values are printed or passed as shell arguments.
if (process.env.META_LIVE_ACCESS_TOKEN) {
  console.log('A live Meta token is already stored locally; no duplicate exchange attempted.');
} else {
  const url = new URL(
    `https://graph.facebook.com/${process.env.META_API_VERSION}/oauth/access_token`,
  );
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', process.env.META_APP_ID);
  url.searchParams.set('client_secret', process.env.META_APP_SECRET);
  url.searchParams.set('fb_exchange_token', process.env.META_EXPLORER_TOKEN);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    console.error(
      JSON.stringify({
        ok: false,
        code: result.error?.code || response.status,
        message: 'Meta token exchange was rejected. No credentials were changed.',
      }),
    );
    process.exitCode = 1;
  } else {
    const expiresAt = new Date(
      Date.now() + Number(result.expires_in || result.expires || 0) * 1000,
    ).toISOString();
    const original = await fs.readFile('.env', 'utf8');
    await fs.writeFile(
      '.env',
      `${original.trimEnd()}\nMETA_LIVE_ACCESS_TOKEN=${JSON.stringify(result.access_token)}\nMETA_TOKEN_EXPIRES_AT=${JSON.stringify(expiresAt)}\n`,
      { mode: 0o600 },
    );
    await fs.mkdir('.data', { recursive: true });
    await fs.writeFile(
      '.data/meta-token-status.json',
      JSON.stringify(
        {
          exchangedAt: new Date().toISOString(),
          expiresAt,
          tokenType: result.token_type,
          advertisingWritesAttempted: false,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        ok: true,
        expiresAt,
        storedLocally: true,
        advertisingWritesAttempted: false,
      }),
    );
  }
}

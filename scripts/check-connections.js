import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import Redis from 'ioredis';
const secretValues = [
  'META_ACCESS_TOKEN',
  'META_EXPLORER_TOKEN',
  'META_LIVE_ACCESS_TOKEN',
  'META_APP_SECRET',
  'LLM_API_KEY',
  'MONGODB_URI',
  'REDIS_URL',
  'UPSTASH_REDIS_REST_TOKEN',
]
  .map((key) => process.env[key])
  .filter(Boolean);
function safeError(error) {
  let message = String(error.message || 'Connection failed');
  for (const value of secretValues) message = message.replaceAll(value, '[redacted]');
  message = message
    .replace(/mongodb(?:\+srv)?:\/\/\S+/g, '[redacted Mongo URI]')
    .replace(/rediss?:\/\/\S+/g, '[redacted Redis URI]');
  return {
    ok: false,
    code: error.code || error.name || 'CONNECTION_FAILED',
    message: message.slice(0, 400),
  };
}
async function checked(task) {
  try {
    return await task();
  } catch (error) {
    return safeError(error);
  }
}
async function metaRead(token, resource, fields) {
  const base = process.env.META_API_VERSION ? `${process.env.META_API_VERSION}/` : '';
  const url = new URL(`https://graph.facebook.com/${base}${resource}`);
  if (fields) url.searchParams.set('fields', fields);
  if (process.env.META_APP_SECRET)
    url.searchParams.set(
      'appsecret_proof',
      crypto.createHmac('sha256', process.env.META_APP_SECRET).update(token).digest('hex'),
    );
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    const error = new Error(data.error?.message || 'Meta rejected access');
    error.code = `META_${data.error?.code || response.status}`;
    throw error;
  }
  return {
    data,
    apiVersion:
      response.headers.get('facebook-api-version') || response.headers.get('x-fb-api-version'),
  };
}
async function inspectMeta(token) {
  const me = await metaRead(token, 'me', 'id,name');
  const result = { ok: true, identity: me.data, apiVersion: me.apiVersion };
  result.permissions = await checked(async () => {
    const value = await metaRead(token, 'me/permissions');
    return { ok: true, permissions: value.data.data };
  });
  result.adAccounts = await checked(async () => {
    const value = await metaRead(
      token,
      'me/adaccounts',
      'id,name,currency,timezone_name,account_status',
    );
    return { ok: true, accounts: value.data.data };
  });
  if (result.adAccounts.ok)
    for (const account of result.adAccounts.accounts)
      account.pixels = await checked(async () => {
        const value = await metaRead(token, `${account.id}/adspixels`, 'id,name');
        return { ok: true, pixels: value.data.data };
      });
  result.pages = await checked(async () => {
    const value = await metaRead(token, 'me/accounts', 'id,name,tasks');
    return { ok: true, pages: value.data.data };
  });
  result.pixel = await checked(async () => {
    const value = await metaRead(token, process.env.META_PIXEL_ID, 'id,name');
    return { ok: true, pixel: value.data };
  });
  return result;
}
const names = ['mongo', 'gemini', 'upstashRest', 'redisTcp', 'metaMarketing', 'metaExplorer'];
const results = await Promise.all([
  checked(async () => {
    const connection = await mongoose
      .createConnection(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 })
      .asPromise();
    try {
      const hello = await connection.db.admin().command({ hello: 1 });
      await connection.db.admin().command({ ping: 1 });
      return {
        ok: true,
        replicaSet: Boolean(hello.setName || hello.msg === 'isdbgrid'),
        database: connection.name,
      };
    } finally {
      await connection.close();
    }
  }),
  checked(async () => {
    const url = new URL(`${process.env.LLM_ENDPOINT.replace(/\/$/, '')}/models`);
    const response = await fetch(url, {
      headers: { 'x-goog-api-key': process.env.LLM_API_KEY },
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error?.message || 'Gemini key rejected');
      error.code = data.error?.status || `HTTP_${response.status}`;
      throw error;
    }
    return {
      ok: true,
      models: (data.models || [])
        .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
        .map((model) => model.name),
    };
  }),
  checked(async () => {
    const response = await fetch(`${process.env.UPSTASH_REDIS_REST_URL}/ping`, {
      headers: { authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      const error = new Error(data.error || 'Upstash REST authentication failed');
      error.code = `UPSTASH_${response.status}`;
      throw error;
    }
    return { ok: data.result === 'PONG', transport: 'REST', bullmqCompatible: false };
  }),
  process.env.REDIS_URL
    ? checked(async () => {
        const client = new Redis(process.env.REDIS_URL, {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null,
          connectTimeout: 10000,
        });
        client.on('error', () => {});
        try {
          await client.connect();
          return { ok: (await client.ping()) === 'PONG', transport: 'TCP/TLS' };
        } finally {
          client.disconnect();
        }
      })
    : Promise.resolve({
        ok: false,
        code: 'REDIS_TCP_REQUIRED',
        message: 'Set REDIS_URL from Upstash Connect → TCP. REST tokens are not TCP passwords.',
      }),
  checked(() => inspectMeta(process.env.META_ACCESS_TOKEN)),
  checked(() => inspectMeta(process.env.META_LIVE_ACCESS_TOKEN || process.env.META_EXPLORER_TOKEN)),
]);
const report = {
  checkedAt: new Date().toISOString(),
  connections: Object.fromEntries(names.map((name, i) => [name, results[i]])),
  advertisingWritesAttempted: false,
};
await fs.mkdir('.data', { recursive: true });
await fs.writeFile('.data/connection-status.json', JSON.stringify(report, null, 2), {
  mode: 0o600,
});
console.log(JSON.stringify(report, null, 2));

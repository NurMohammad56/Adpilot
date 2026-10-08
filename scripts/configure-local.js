import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const allowed = [
  'META_ACCESS_TOKEN',
  'META_EXPLORER_TOKEN',
  'META_APP_ID',
  'META_APP_SECRET',
  'META_PIXEL_ID',
  'LLM_PROVIDER',
  'LLM_ENDPOINT',
  'LLM_API_KEY',
  'MONGODB_URI',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];
for (const key of Object.keys(input))
  if (!allowed.includes(key)) throw new Error('Unsupported configuration key');
let previous = {};
try {
  previous = dotenv.parse(await fs.readFile('.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const mongo = new URL(input.MONGODB_URI);
if (mongo.pathname === '/') mongo.pathname = '/bd_ads';
const value = {
  APP_MODE: 'demo',
  NODE_ENV: 'development',
  PORT: '4000',
  APP_ORIGIN: 'http://localhost:4000',
  DATA_FILE: '.data/demo.json',
  LIVE_EXECUTION_ENABLED: 'false',
  TOKEN_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  MCP_SERVICE_KEY: crypto.randomBytes(32).toString('hex'),
  META_API_VERSION: '',
  LLM_MODEL: '',
  TRUST_PROXY: '0',
  ...previous,
  ...input,
  MONGODB_URI: mongo.toString(),
};
await fs.writeFile(
  '.env',
  '# Local credentials. Ignored by Git. Do not share or commit.\n' +
    Object.entries(value)
      .map(([key, content]) => `${key}=${JSON.stringify(String(content))}`)
      .join('\n') +
    '\n',
  { mode: 0o600 },
);
console.log(
  'Local credentials saved to the Git-ignored .env file. Live execution remains disabled.',
);

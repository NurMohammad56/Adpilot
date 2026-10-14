import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from './config/index.js';
import { createStore } from './db/store.js';
import { LLMService } from './ai/provider.js';
import { DemoMetaAdapter, LiveMetaAdapter } from './integrations/meta/adapter.js';
import { Platform } from './modules/platform.js';
import { AuthService } from './modules/auth/service.js';
import { createQueue } from './workers/queue.js';
import { seedDemo } from './seed.js';
import { createStorage } from './storage/index.js';
import { MediaService } from './modules/media/service.js';
import { ResearchWorkbench } from './modules/research/workbench.js';
import { createTelemetry } from './modules/operations/health.js';
import { migrate } from './modules/operations/migrations.js';
export async function createRuntime(options = {}) {
  const config = options.config || loadConfig();
  if (!config.serviceKey && config.mode === 'demo')
    config.serviceKey = crypto.randomBytes(32).toString('hex');
  const store = options.store || (await createStore(config));
  await migrate(store);
  if (!config.encryptionKey && config.mode === 'demo') {
    if (!store.file) config.encryptionKey = crypto.randomBytes(32).toString('hex');
    else {
      const keyFile = `${store.file}.key`;
      await fs.mkdir(path.dirname(keyFile), { recursive: true });
      try {
        await fs.writeFile(keyFile, crypto.randomBytes(32).toString('hex'), {
          flag: 'wx',
          mode: 0o600,
        });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
      config.encryptionKey = (await fs.readFile(keyFile, 'utf8')).trim();
      if (!/^[a-f0-9]{64}$/.test(config.encryptionKey))
        throw new Error('Demo encryption key file is invalid');
    }
  }
  const meta =
    options.meta || (config.mode === 'demo' ? new DemoMetaAdapter() : new LiveMetaAdapter(config));
  const llm =
    options.llm ||
    new LLMService(config.mode === 'demo' ? { ...config, llmProvider: 'demo' } : config);
  const platform = new Platform(store, config, llm, meta);
  const media = new MediaService(platform, options.storage || createStorage(config));
  platform.media = media;
  meta.media = media;
  const research = new ResearchWorkbench(platform);
  platform.research = research;
  const auth = new AuthService(store);
  const jobs = options.jobs === undefined ? createQueue(config) : options.jobs;
  if (config.mode === 'demo' && options.seed !== false) await seedDemo(store, platform);
  return {
    config,
    store,
    meta,
    platform,
    auth,
    jobs,
    media,
    research,
    telemetry: createTelemetry(),
    async close() {
      if (jobs) await jobs.close();
      await store.close();
    },
  };
}

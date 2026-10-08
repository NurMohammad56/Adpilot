import crypto from 'node:crypto';
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
export async function createRuntime(options = {}) {
  const config = options.config || loadConfig();
  if (!config.serviceKey && config.mode === 'demo')
    config.serviceKey = crypto.randomBytes(32).toString('hex');
  const store = options.store || (await createStore(config));
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
    async close() {
      if (jobs) await jobs.close();
      await store.close();
    },
  };
}

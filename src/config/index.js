import 'dotenv/config';
import path from 'node:path';
export function loadConfig(env = process.env) {
  const mode = env.APP_MODE || 'demo';
  if (!['demo', 'live'].includes(mode)) throw new Error('APP_MODE must be demo or live');
  const production = env.NODE_ENV === 'production';
  const backgroundJobs = env.BACKGROUND_JOBS_ENABLED !== 'false';
  if (production && mode === 'demo') throw new Error('Demo mode cannot run as production');
  if (
    mode === 'live' &&
    (!env.MONGODB_URI ||
      (backgroundJobs && !env.REDIS_URL) ||
      !/^[a-f\d]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY || '') ||
      (env.MCP_SERVICE_KEY || '').length < 32)
  ) {
    throw new Error(
      'Live mode requires MongoDB, Redis, a 32-byte hex encryption key and a strong MCP service key',
    );
  }
  if (mode === 'live' && !backgroundJobs && (production || env.LIVE_EXECUTION_ENABLED === 'true'))
    throw new Error('Production and paid execution require background jobs with Redis');
  if (mode === 'live' && !/^v\d+\.\d+$/.test(env.META_API_VERSION || ''))
    throw new Error('Set META_API_VERSION explicitly for live mode');
  const origin = env.APP_ORIGIN || 'http://localhost:5173';
  const basePath = (env.APP_BASE_PATH || '').replace(/\/$/, '');
  if (basePath && !/^\/(?:[a-zA-Z0-9_-]+\/?)+$/.test(basePath))
    throw new Error('APP_BASE_PATH must be a URL path such as /adpilot');
  if (new URL(origin).pathname !== '/')
    throw new Error(
      'APP_ORIGIN must contain only the scheme and host; use APP_BASE_PATH for /adpilot',
    );
  if (production && !origin.startsWith('https://'))
    throw new Error('Production requires an HTTPS APP_ORIGIN');
  if (
    production &&
    (env.STORAGE_DRIVER || 'local') === 'local' &&
    env.STORAGE_PERSISTENT !== 'true'
  )
    throw new Error(
      'Production local uploads require a confirmed persistent storage volume or S3 storage',
    );
  return {
    mode,
    production,
    port: Number(env.PORT || 4000),
    origin,
    basePath,
    dataFile: path.resolve(env.DATA_FILE || '.data/demo.json'),
    mongoUri: env.MONGODB_URI,
    redisUrl: env.REDIS_URL,
    backgroundJobs,
    encryptionKey: env.TOKEN_ENCRYPTION_KEY,
    serviceKey: env.MCP_SERVICE_KEY,
    liveExecution: mode === 'live' && env.LIVE_EXECUTION_ENABLED === 'true',
    metaVersion: env.META_API_VERSION,
    metaAppSecret: env.META_APP_SECRET,
    llmProvider: env.LLM_PROVIDER || 'demo',
    llmEndpoint: env.LLM_ENDPOINT,
    llmKey: env.LLM_API_KEY,
    llmModel:
      env.LLM_MODEL || (env.LLM_PROVIDER === 'openai' ? 'gpt-6-luna' : 'gemini-3.1-flash-lite'),
    researchModel:
      env.LLM_RESEARCH_MODEL ||
      (env.LLM_PROVIDER === 'openai' ? 'gpt-6-luna' : 'gemini-3-flash-preview'),
    researchThinking: env.LLM_RESEARCH_THINKING || 'high',
    geminiGrounding: env.GEMINI_SEARCH_GROUNDING === 'true',
    searchGrounding: (env.LLM_SEARCH_GROUNDING ?? env.GEMINI_SEARCH_GROUNDING) === 'true',
    trustProxy: Number(env.TRUST_PROXY || 0),
    storageDriver: env.STORAGE_DRIVER || 'local',
    storagePath: path.resolve(env.STORAGE_PATH || '.data/uploads'),
    storageBucket: env.S3_BUCKET,
    storageEndpoint: env.S3_ENDPOINT || undefined,
    storageRegion: env.S3_REGION || 'auto',
    storageAccessKey: env.S3_ACCESS_KEY_ID,
    storageSecretKey: env.S3_SECRET_ACCESS_KEY,
    gatewayHosts: (env.LLM_ALLOWED_GATEWAY_HOSTS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  };
}

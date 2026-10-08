import { LLMService } from '../ai/provider.js';
import { AppError, assert, seal, unseal, now } from '../utils/core.js';
export async function workspaceLLM(platform, businessId) {
  if (platform.config.mode === 'demo') return platform.llm;
  const row = await platform.store.find('integrations', { businessId, provider: 'AI' });
  if (!row)
    throw new AppError(
      409,
      'AI_NOT_CONFIGURED',
      'Connect an AI provider in Accounts for this workspace',
    );
  return new LLMService({
    ...platform.config,
    llmProvider: row.aiProvider,
    llmEndpoint: row.endpoint,
    llmModel: row.model,
    researchModel: row.researchModel || platform.config.researchModel || row.model,
    researchThinking: row.researchThinking || 'high',
    llmKey: unseal(row.encryptedKey, platform.config.encryptionKey),
    geminiGrounding: row.grounding,
  });
}
export function publicAI(row) {
  return row
    ? {
        configured: true,
        provider: row.aiProvider,
        model: row.model,
        researchModel: row.researchModel,
        researchThinking: row.researchThinking || 'high',
        grounding: row.grounding,
        verifiedAt: row.verifiedAt,
      }
    : { configured: false };
}
export async function configureAI(platform, user, input) {
  assert(
    user.role === 'admin',
    403,
    'ROLE_REQUIRED',
    'Only workspace administrators can configure AI',
  );
  assert(
    platform.config.mode === 'live',
    409,
    'DEMO_MODE',
    'Demo workspaces use simulated providers',
  );
  const previous = await platform.store.find('integrations', {
    businessId: user.businessId,
    provider: 'AI',
  });
  assert(
    input.apiKey || (previous?.encryptedKey && previous.aiProvider === input.provider),
    422,
    'AI_KEY_REQUIRED',
    'Provide an API key to connect this AI provider.',
  );
  const apiKey = input.apiKey || unseal(previous.encryptedKey, platform.config.encryptionKey);
  const endpoint =
    input.provider === 'gemini'
      ? 'https://generativelanguage.googleapis.com/v1beta'
      : input.endpoint;
  if (input.provider === 'gateway') {
    const url = new URL(endpoint);
    assert(
      url.protocol === 'https:' && platform.config.gatewayHosts.includes(url.hostname),
      422,
      'GATEWAY_HOST',
      'The deployment administrator must allow this gateway hostname',
    );
  }
  if (input.provider === 'gemini') {
    for (const model of new Set([
      input.model,
      input.researchModel || platform.config.researchModel || input.model,
    ])) {
      const response = await fetch(`${endpoint}/models/${model}`, {
        headers: { 'x-goog-api-key': apiKey },
        signal: AbortSignal.timeout(15000),
      }).catch(() => {
        throw new AppError(502, 'AI_UNAVAILABLE', 'Could not verify the AI provider');
      });
      assert(response.ok, 422, 'AI_CREDENTIALS', 'API key or selected model could not be verified');
    }
  }
  return platform.store.transaction(async () => {
    const existing = await platform.store.find('integrations', {
      businessId: user.businessId,
      provider: 'AI',
    });
    const value = {
      businessId: user.businessId,
      provider: 'AI',
      aiProvider: input.provider,
      endpoint,
      model: input.model,
      researchModel: input.researchModel || platform.config.researchModel || input.model,
      researchThinking: input.researchThinking || 'high',
      encryptedKey: input.apiKey
        ? seal(apiKey, platform.config.encryptionKey)
        : previous.encryptedKey,
      grounding: input.grounding,
      verifiedAt: now(),
    };
    const row = existing
      ? await platform.store.update('integrations', existing.id, value)
      : await platform.store.insert('integrations', value);
    await platform.audit(user, 'integration.ai_configured', row.id, {
      provider: input.provider,
      model: input.model,
    });
    return publicAI(row);
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import { fixture, productInput } from './helpers.js';
import { createApp } from '../src/app.js';
import { projectSchema } from '../src/modules/research/workbench.js';
import { calculateEconomics } from '../src/modules/pricing/engine.js';
import { recommendBudget } from '../src/modules/budgeting/engine.js';
import { seal, unseal } from '../src/utils/core.js';
const origin = 'http://localhost:5173';
test('approved linked BD research creates a product campaign and a follow-up invalidates its launch approval', async () => {
  const f = await fixture();
  try {
    const project = await f.research.create(f.user, projectSchema.parse({ name: f.product.name, kind: 'physical-product', productId: f.product.id, description: f.product.description, buyerProfile: 'Bangladesh buyers within our delivery coverage.', candidateCountries: ['BD'] }));
    const initial = await f.research.research(f.user, project.id);
    const version = await f.research.edit(f.user, initial.id, { summary: initial.report.summary, recommendation: { country: 'BD', reason: 'Test the verified local offer within delivery coverage.', nextSteps: ['Measure delivered purchases and failed orders.'] }, note: 'Reviewed cost assumptions and delivery constraints.' });
    await f.research.submit(f.user, version.id);
    await f.research.decide(f.user, version.id, 'approve', 'Approved a capped Bangladesh test.');
    const agent = request.agent(createApp(f));
    await agent.post('/api/auth/login').set('Origin', origin).send({ email: f.user.email, password: 'SecureTestPassword2026!' }).expect(200);
    const { body: plan } = await agent.post(`/api/research/versions/${version.id}/product-campaign`).set('Origin', origin).send({}).expect(201);
    assert.equal(plan.productId, f.product.id);
    assert.equal(plan.researchProjectId, project.id);
    assert.equal(plan.researchDecisionHash, version.reportHash);
    assert.equal(plan.research.summary, initial.report.summary);
    await f.platform.submitPlan(f.user, plan.id);
    await f.research.research(f.user, project.id, 'Reconsider delivery risk before spending.');
    await assert.rejects(f.platform.assertFresh(plan, f.user), { code: 'RESEARCH_APPROVAL_REQUIRED' });
    await assert.rejects(f.platform.revisePlan(f.user, plan.id, { dailyBudget: 100 }), { code: 'RESEARCH_APPROVAL_REQUIRED' });
  } finally { await f.close(); }
});
test('research cannot link another workspace product', async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.research.create({ ...f.user, businessId: crypto.randomUUID() }, projectSchema.parse({ name: 'Foreign product', kind: 'physical-product', productId: f.product.id, description: 'An invalid cross-workspace product link.', buyerProfile: 'Bangladesh buyers', candidateCountries: ['BD'] })), { code: 'NOT_FOUND' });
  } finally { await f.close(); }
});
test('Meta re-verification reuses only this workspace encrypted token and preserves its app secret', async () => {
  const f = await fixture();
  try {
    f.config.mode = 'live'; f.config.encryptionKey = crypto.randomBytes(32).toString('hex');
    await f.store.insert('integrations', { businessId: f.user.businessId, provider: 'META', adAccountId: '123', pageId: '456', pixelId: '789', encryptedToken: seal('private-saved-meta-access-token', f.config.encryptionKey), encryptedAppSecret: seal('private-app-secret', f.config.encryptionKey) });
    f.platform.meta.verify = async integration => {
      assert.equal(unseal(integration.encryptedToken, f.config.encryptionKey), 'private-saved-meta-access-token');
      assert.equal(unseal(integration.encryptedAppSecret, f.config.encryptionKey), 'private-app-secret');
      return { accountStatus: 1, currency: 'BDT' };
    };
    const value = await f.platform.configureMeta(f.user, { adAccountId: 'act_123', pageId: '456', pixelId: '789', accessToken: '', appSecret: '' });
    assert.equal(value.encryptedToken, undefined);
    await assert.rejects(f.platform.configureMeta({ ...f.user, businessId: crypto.randomUUID() }, { adAccountId: '123', pageId: '456', pixelId: '789' }), { code: 'TOKEN_REQUIRED' });
  } finally { await f.close(); }
});
test('account form returns field-specific validation for email in the ad account ID', async () => {
  const f = await fixture();
  try {
    const agent = request.agent(createApp(f));
    await agent.post('/api/auth/login').set('Origin', origin).send({ email: f.user.email, password: 'SecureTestPassword2026!' }).expect(200);
    const response = await agent.post('/api/integrations/meta').set('Origin', origin).set('x-request-id', crypto.randomUUID()).send({ adAccountId: 'admin@example.com', pageId: '456', pixelId: '789' }).expect(422);
    assert.match(response.body.error.details.fieldErrors.adAccountId[0], /numeric ad account ID/);
    assert.match(response.headers['x-request-id'], /^[a-f\d-]{36}$/);
  } finally { await f.close(); }
});
test('small total budgets remain valid and COD sensitivity decreases allowable CPA as returns increase', () => {
  const product = { ...structuredClone(productInput), testBudgetCeiling: 50 };
  product.costs.returnRate = 0.2;
  const economics = calculateEconomics(product);
  const budget = recommendBudget(product, { dailyBudgetCeiling: 1000, totalBudgetCeiling: 50 }, economics);
  assert.equal(budget.dailyBudget, 50);
  assert.equal(budget.durationDays, 1);
  assert.equal(budget.totalBudget, 50);
  assert.equal(economics.failureScenarios[1].allowableCPA, economics.targetCPA);
  assert.ok(economics.failureScenarios[2].allowableCPA < economics.failureScenarios[0].allowableCPA);
});

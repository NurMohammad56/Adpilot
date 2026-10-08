import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { fixture } from './helpers.js';
import { seal, unseal } from '../src/utils/core.js';
const origin = 'http://localhost:5173';
test('API protects authentication, session cookies and request origin', async () => {
  const f = await fixture();
  const app = createApp(f);
  const agent = request.agent(app);
  await agent.get('/api/overview').expect(401);
  await agent
    .post('/api/auth/login')
    .set('Origin', 'https://attacker.example')
    .send({ email: f.user.email, password: 'SecureTestPassword2026!' })
    .expect(403);
  const login = await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: f.user.email, password: 'SecureTestPassword2026!' })
    .expect(200);
  assert.match(login.headers['set-cookie'][0], /HttpOnly/);
  assert.match(login.headers['set-cookie'][0], /SameSite=Strict/);
  assert.equal(login.body.user.passwordHash, undefined);
  const overview = await agent.get('/api/overview').expect(200);
  assert.equal(overview.body.business.id, f.user.businessId);
  assert.equal(overview.body.integration.encryptedToken, undefined);
  await agent.post('/api/auth/logout').set('Origin', origin).send({}).expect(200);
  await agent.get('/api/overview').expect(401);
  await f.close();
});
test('strict schemas reject invented costs, non-BD modes and arbitrary AI action payloads', async () => {
  const f = await fixture();
  const app = createApp(f);
  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .set('Origin', origin)
    .send({ email: f.user.email, password: 'SecureTestPassword2026!' })
    .expect(200);
  await agent
    .post('/api/products')
    .set('Origin', origin)
    .send({ name: 'Invalid', costs: { product: -100 }, country: 'US' })
    .expect(422);
  await agent
    .post(`/api/products/${f.product.id}/plans`)
    .set('Origin', origin)
    .send({ market: 'US' })
    .expect(422);
  await agent
    .post('/api/internal/mcp/action')
    .send({ approvalId: f.product.id, toolName: 'create_campaign' })
    .expect(401);
  await f.close();
});
test(
  'an interactive approved launch travels through a real MCP stdio client/server',
  { timeout: 30000 },
  async () => {
    const f = await fixture();
    const app = createApp(f);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    f.config.port = server.address().port;
    try {
      const agent = request.agent(server);
      await agent
        .post('/api/auth/login')
        .set('Origin', origin)
        .send({ email: f.user.email, password: 'SecureTestPassword2026!' })
        .expect(200);
      const plan = (
        await agent
          .post(`/api/products/${f.product.id}/plans`)
          .set('Origin', origin)
          .send({})
          .expect(201)
      ).body;
      const approval = (
        await agent.post(`/api/plans/${plan.id}/submit`).set('Origin', origin).send({}).expect(201)
      ).body;
      await agent
        .post(`/api/approvals/${approval.id}/decision`)
        .set('Origin', origin)
        .send({ decision: 'approve', comment: 'Approve this exact plan' })
        .expect(200);
      const result = await agent
        .post(`/api/approvals/${approval.id}/execute`)
        .set('Origin', origin)
        .send({})
        .expect(200);
      assert.equal(result.body.demo, true);
      assert.equal(result.body.status, 'active');
      const repeated = await agent
        .post(`/api/approvals/${approval.id}/execute`)
        .set('Origin', origin)
        .send({})
        .expect(200);
      assert.equal(repeated.body.campaignId, result.body.campaignId);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await f.close();
    }
  },
);
test('AES-GCM token encryption detects ciphertext tampering', () => {
  const key = 'a'.repeat(64);
  const token = 'secret-meta-token-that-must-stay-server-side';
  const sealed = seal(token, key);
  assert.notEqual(sealed, token);
  assert.equal(unseal(sealed, key), token);
  assert.throws(() => unseal(`${sealed.slice(0, -2)}ff`, key));
});

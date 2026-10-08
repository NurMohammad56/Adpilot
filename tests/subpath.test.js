import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { fixture } from './helpers.js';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/index.js';
test('proxy subpath scopes authentication cookies, API calls and private media URLs', async () => {
  const f = await fixture();
  try {
    f.config.basePath = '/adpilot';
    const proxy = express();
    proxy.use('/adpilot', createApp(f));
    const agent = request.agent(proxy);
    const login = await agent
      .post('/adpilot/api/auth/login')
      .set('Origin', f.config.origin)
      .send({ email: f.user.email, password: 'SecureTestPassword2026!' })
      .expect(200);
    assert.match(login.headers['set-cookie'][0], /Path=\/adpilot\//);
    await agent.get('/adpilot/api/overview').expect(200);
    await agent.get('/api/overview').expect(404);
    assert.equal(
      f.media.public({ id: f.product.id, storageKey: 'private-bucket-key' }).contentUrl,
      `/adpilot/api/media/${f.product.id}/content`,
    );
    const logout = await agent
      .post('/adpilot/api/auth/logout')
      .set('Origin', f.config.origin)
      .send({})
      .expect(200);
    assert.match(logout.headers['set-cookie'][0], /Path=\/adpilot\//);
    await agent.get('/adpilot/api/overview').expect(401);
  } finally {
    await f.close();
  }
});
test('deployment config separates browser origin from base path and rejects malformed mount paths', () => {
  assert.throws(
    () => loadConfig({ APP_MODE: 'demo', APP_ORIGIN: 'https://fahimstack.tech/adpilot' }),
    /APP_ORIGIN/,
  );
  assert.throws(
    () => loadConfig({ APP_MODE: 'demo', APP_BASE_PATH: '/adpilot/../../other' }),
    /APP_BASE_PATH/,
  );
  assert.equal(loadConfig({ APP_MODE: 'demo', APP_BASE_PATH: '/adpilot/' }).basePath, '/adpilot');
});

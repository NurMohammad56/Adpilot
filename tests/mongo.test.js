import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoStore } from '../src/db/store.js';
import { fixture, approved } from './helpers.js';
test(
  'real Mongo replica-set transactions enforce rollback, isolation and budget reservations',
  { timeout: 180000 },
  async () => {
    const replica = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      binary: { version: '7.0.24' },
    });
    const store = new MongoStore(replica.getUri('adpilot_test'));
    await store.connect();
    try {
      const f = await fixture({ store });
      await assert.rejects(
        store.transaction(async () => {
          await store.insert('audit_logs', {
            businessId: f.user.businessId,
            actorId: f.user.id,
            action: 'should.rollback',
          });
          throw new Error('rollback');
        }),
      );
      assert.equal((await store.list('audit_logs', { action: 'should.rollback' })).length, 0);
      await f.platform.updateBusiness(f.user, {
        name: 'Mongo Test',
        location: 'Dhaka',
        dailyBudgetCeiling: 1500,
        totalBudgetCeiling: 30000,
        deliveryRegions: ['Dhaka'],
      });
      const a = await approved(f, { dailyBudget: 1000, durationDays: 7 });
      const b = await approved(f, { dailyBudget: 1000, durationDays: 7 });
      const outcomes = await Promise.allSettled([
        f.platform.executeApproved(a.approval.id, 'create_campaign'),
        f.platform.executeApproved(b.approval.id, 'create_campaign'),
      ]);
      assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        outcomes.find((r) => r.status === 'rejected').reason.code,
        'ACCOUNT_DAILY_CEILING',
      );
      assert.equal((await store.list('campaigns')).length, 1);
      const campaign = (await store.list('campaigns'))[0];
      assert.equal(campaign.status, 'active');
      await f.platform.syncInsights(f.user, campaign.id);
      await f.platform.syncInsights(f.user, campaign.id);
      assert.equal((await store.list('ad_performance', { level: 'campaign' })).length, 7);
      assert.equal((await store.list('ad_performance', { level: 'adset' })).length, 7);
      assert.equal((await store.list('ad_performance', { level: 'ad' })).length, 21);
      const session = await f.auth.session(f.user);
      const workspace = await f.auth.createWorkspace(f.user, 'Independent service client');
      const client = await f.auth.switchWorkspace(session.token, workspace.id);
      assert.equal(client.role, 'admin');
      assert.equal((await f.auth.resolve(session.token)).businessId, workspace.id);
      await assert.rejects(f.platform.owned('products', f.product.id, client), {
        code: 'NOT_FOUND',
      });
      const project = await f.research.create(client, {
        name: 'Custom ecommerce',
        kind: 'service',
        description: 'Custom stores for retailers.',
        buyerProfile: 'Retail business owners',
        candidateCountries: ['US', 'GB'],
        questions: '',
        evidence: [],
      });
      const research = await f.research.research(client, project.id);
      const current = await store.get('research_projects', project.id);
      const concurrent = await Promise.allSettled([
        f.research.saveVersion(client, current, research.report, 'Review market fit'),
        f.research.saveVersion(client, current, research.report, 'Review sales barriers'),
      ]);
      assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(
        concurrent.find((result) => result.status === 'rejected').reason.code,
        'RESEARCH_CHANGED',
      );
      const history = await store.list('research_versions', { projectId: project.id });
      assert.deepEqual(history.map((version) => version.number).sort(), [1, 2]);
      assert.ok(history.every((version) => version.businessId === workspace.id));
    } finally {
      await store.close();
      await replica.stop();
    }
  },
);

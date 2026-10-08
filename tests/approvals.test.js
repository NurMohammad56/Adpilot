import test from 'node:test';
import assert from 'node:assert/strict';
import { DemoMetaAdapter } from '../src/integrations/meta/adapter.js';
import { fixture, approved, productInput } from './helpers.js';
test('unapproved launches never call Meta', async () => {
  const f = await fixture();
  const plan = await f.platform.createPlan(f.user, f.product.id);
  const approval = await f.platform.submitPlan(f.user, plan.id);
  await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
    code: 'APPROVAL_REQUIRED',
  });
  assert.equal(f.meta.calls.length, 0);
  await f.close();
});
test('edits supersede pending approval and produce a new validated version', async () => {
  const f = await fixture();
  const plan = await f.platform.createPlan(f.user, f.product.id);
  const a = await f.platform.submitPlan(f.user, plan.id);
  const revised = await f.platform.revisePlan(f.user, plan.id, { dailyBudget: 500 });
  assert.equal(revised.version, 2);
  assert.equal((await f.store.get('approval_requests', a.id)).status, 'superseded');
  await assert.rejects(f.platform.decide(f.user, a.id, 'approve', ''), { code: 'APPROVAL_STATE' });
  await f.close();
});
test('price/cost changes invalidate approval before any Meta write', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  await f.platform.updateProduct(f.user, f.product.id, { ...productInput, sellingPrice: 1600 });
  await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
    code: 'STALE_PLAN',
  });
  assert.equal(f.meta.calls.length, 0);
  await f.close();
});
test('approved payload tampering is detected', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  approval.snapshot.budgetRecommendation.dailyBudget = 999999;
  await f.store.update('approval_requests', approval.id, { snapshot: approval.snapshot });
  await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
    code: 'SNAPSHOT_TAMPERED',
  });
  assert.equal(f.meta.calls.length, 0);
  await f.close();
});
test('expired approval cannot execute', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  await f.store.update('approval_requests', approval.id, {
    expiresAt: new Date(Date.now() - 1).toISOString(),
  });
  await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
    code: 'APPROVAL_EXPIRED',
  });
  await f.close();
});
test('repeat execution returns the original result without duplicate Meta objects', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  const first = await f.platform.executeApproved(approval.id, 'create_campaign');
  const count = f.meta.calls.length;
  const second = await f.platform.executeApproved(approval.id, 'create_campaign');
  assert.deepEqual(second, first);
  assert.equal(f.meta.calls.length, count);
  assert.equal((await f.store.list('campaigns')).length, 1);
  await f.close();
});
test('parallel launch reservations cannot exceed the shared daily ceiling', async () => {
  const f = await fixture();
  await f.platform.updateBusiness(f.user, {
    name: 'Test Business',
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
  assert.equal(outcomes.find((r) => r.status === 'rejected').reason.code, 'ACCOUNT_DAILY_CEILING');
  assert.equal((await f.store.list('campaigns')).length, 1);
  await f.close();
});
test('partial Meta failures preserve checkpoints, reserve budget and block retries', async () => {
  class FailingMeta extends DemoMetaAdapter {
    async launch(plan, integration, onStep) {
      await onStep('campaign', 'remote_created');
      throw new Error('Connection lost');
    }
  }
  const f = await fixture({ meta: new FailingMeta() });
  const { approval } = await approved(f);
  await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'));
  const campaign = (await f.store.list('campaigns'))[0];
  assert.equal(campaign.steps.campaign, 'remote_created');
  assert.equal(campaign.status, 'needs_reconciliation');
  assert.equal(
    (await f.store.get('approval_requests', approval.id)).status,
    'needs_reconciliation',
  );
  await assert.rejects(f.platform.executeApproved(approval.id, 'create_campaign'), {
    code: 'APPROVAL_REQUIRED',
  });
  await f.close();
});
test('pausing requires approval and remains available after cost changes', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  const result = await f.platform.executeApproved(approval.id, 'create_campaign');
  await f.platform.updateProduct(f.user, f.product.id, { ...productInput, inventory: 0 });
  const pause = await f.platform.proposeAction(
    f.user,
    result.campaignId,
    'pause_campaign',
    {},
    'Pause to stop spending due to inventory loss',
  );
  await assert.rejects(f.platform.executeApproved(pause.id, 'pause_campaign'), {
    code: 'APPROVAL_REQUIRED',
  });
  await f.platform.decide(f.user, pause.id, 'approve', 'Inventory exhausted');
  await f.platform.executeApproved(pause.id, 'pause_campaign');
  assert.equal((await f.store.get('campaigns', result.campaignId)).status, 'paused');
  await f.close();
});
test('insight sync is an upsert rather than repeated revenue/spend duplication', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  const result = await f.platform.executeApproved(approval.id, 'create_campaign');
  await f.platform.syncInsights(f.user, result.campaignId);
  const first = await f.platform.overview(f.user);
  await f.platform.syncInsights(f.user, result.campaignId);
  const second = await f.platform.overview(f.user);
  assert.equal(first.performance.length, second.performance.length);
  assert.equal(first.metrics.spend, second.metrics.spend);
  await f.close();
});
test('an analyst cannot approve or execute a sensitive action', async () => {
  const f = await fixture();
  const analyst = { ...f.user, role: 'analyst' };
  const { approval } = await approved(f);
  assert.throws(() => f.platform.requireApprover(analyst), { code: 'ROLE_REQUIRED' });
  await assert.rejects(f.platform.decide(analyst, approval.id, 'approve', ''), {
    code: 'ROLE_REQUIRED',
  });
  await f.close();
});
test('another business cannot read or approve records', async () => {
  const f = await fixture();
  const outsider = await f.auth.register({
    name: 'Other Admin',
    email: 'other@test.local',
    password: 'SecureOtherPassword2026!',
    businessName: 'Other Business',
  });
  await assert.rejects(f.platform.owned('products', f.product.id, outsider), { code: 'NOT_FOUND' });
  const { approval } = await approved(f);
  await assert.rejects(f.platform.decide(outsider, approval.id, 'approve', ''), {
    code: 'NOT_FOUND',
  });
  await f.close();
});

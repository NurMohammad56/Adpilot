import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, approved } from './helpers.js';
test('a budget payload changed after approval cannot execute even below the ceiling', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  const result = await f.platform.executeApproved(approval.id, 'create_campaign');
  const budget = await f.platform.proposeAction(
    f.user,
    result.campaignId,
    'update_budget',
    { dailyBudget: 1200 },
    'Controlled budget test after human performance review',
  );
  await f.platform.decide(f.user, budget.id, 'approve', 'Approve only 1200');
  const count = f.meta.calls.length;
  await f.store.update('approval_requests', budget.id, { payload: { dailyBudget: 1400 } });
  await assert.rejects(f.platform.executeApproved(budget.id, 'update_budget'), {
    code: 'ACTION_TAMPERED',
  });
  assert.equal(f.meta.calls.length, count);
  await f.close();
});
test('budget actions above a product ceiling are rejected before approval', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  const result = await f.platform.executeApproved(approval.id, 'create_campaign');
  await assert.rejects(
    f.platform.proposeAction(
      f.user,
      result.campaignId,
      'update_budget',
      { dailyBudget: 1501 },
      'Increase exceeds the approved product ceiling',
    ),
    { code: 'BUDGET_CEILING' },
  );
  await f.close();
});
test('pausing preserves total spend-cap reservations for the business', async () => {
  const f = await fixture();
  await f.platform.updateBusiness(f.user, {
    name: 'Test',
    location: 'Dhaka',
    dailyBudgetCeiling: 3000,
    totalBudgetCeiling: 11000,
    deliveryRegions: ['Dhaka'],
  });
  const first = await approved(f);
  const result = await f.platform.executeApproved(first.approval.id, 'create_campaign');
  const pause = await f.platform.proposeAction(
    f.user,
    result.campaignId,
    'pause_campaign',
    {},
    'Pause while reviewing actual delivered order economics',
  );
  await f.platform.decide(f.user, pause.id, 'approve', 'Pause');
  await f.platform.executeApproved(pause.id, 'pause_campaign');
  const next = await approved(f);
  await assert.rejects(f.platform.executeApproved(next.approval.id, 'create_campaign'), {
    code: 'ACCOUNT_TOTAL_CEILING',
  });
  await f.close();
});
test('approval cannot be used with a different MCP tool', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  await assert.rejects(f.platform.executeApproved(approval.id, 'update_budget'), {
    code: 'TOOL_ACTION_MISMATCH',
  });
  assert.equal(f.meta.calls.length, 0);
  await f.close();
});

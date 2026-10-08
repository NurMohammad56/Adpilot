import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, approved } from './helpers.js';
test('targeting changes require approval, preserve market and invalidate overlapping actions', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  const result = await f.platform.executeApproved(approval.id, 'create_campaign');
  await assert.rejects(
    f.platform.proposeAction(
      f.user,
      result.campaignId,
      'update_targeting',
      { locations: ['New York'], ageMin: 18, ageMax: 65, experimentLabel: 'Location test' },
      'Test a different location',
    ),
    { code: 'TARGETING_INVALID' },
  );
  const first = await f.platform.proposeAction(
    f.user,
    result.campaignId,
    'update_targeting',
    {
      locations: ['Chattogram'],
      ageMin: 18,
      ageMax: 65,
      experimentLabel: 'Chattogram location experiment',
    },
    'Test an alternative supported Bangladesh delivery location',
  );
  const overlap = await f.platform.proposeAction(
    f.user,
    result.campaignId,
    'update_budget',
    { dailyBudget: 1000 },
    'A separate overlapping budget change request',
  );
  await f.platform.decide(f.user, first.id, 'approve', 'Change location only');
  await f.platform.executeApproved(first.id, 'update_ad_set');
  assert.deepEqual((await f.store.get('campaigns', result.campaignId)).audience.locations, [
    'Chattogram',
  ]);
  await assert.rejects(f.platform.decide(f.user, overlap.id, 'approve', ''), {
    code: 'STALE_ACTION',
  });
  await f.close();
});
test('creative replacement is ad-scoped, approved, checkpointed and versioned', async () => {
  const f = await fixture();
  const { plan, approval } = await approved(f);
  const result = await f.platform.executeApproved(approval.id, 'create_campaign');
  const ad = (await f.store.list('ads', { campaignId: result.campaignId }))[0];
  const { id, hypothesis, ...creative } = plan.ads[0];
  creative.headline = 'A new product-led creative hypothesis';
  const change = await f.platform.proposeAction(
    f.user,
    result.campaignId,
    'replace_creative',
    { adId: ad.id, creative, experimentLabel: 'Headline experiment A' },
    'Replace a creative with a reviewed new headline hypothesis',
  );
  await assert.rejects(f.platform.executeApproved(change.id, 'update_ad'), {
    code: 'APPROVAL_REQUIRED',
  });
  await f.platform.decide(f.user, change.id, 'approve', 'Change one creative only');
  await f.platform.executeApproved(change.id, 'update_ad');
  assert.equal((await f.store.get('ads', ad.id)).currentCreative.headline, creative.headline);
  assert.ok((await f.store.get('campaigns', result.campaignId)).steps[`replacement:${change.id}`]);
  assert.equal((await f.store.list('creatives', { approvalId: change.id })).length, 1);
  await f.close();
});
test('a changed targeting payload cannot spend an existing approval', async () => {
  const f = await fixture();
  const { approval } = await approved(f);
  const result = await f.platform.executeApproved(approval.id, 'create_campaign');
  const change = await f.platform.proposeAction(
    f.user,
    result.campaignId,
    'update_targeting',
    { locations: ['Dhaka'], ageMin: 18, ageMax: 65, experimentLabel: 'Adult audience baseline' },
    'Review an explicitly scoped adult audience',
  );
  await f.platform.decide(f.user, change.id, 'approve', 'Exact baseline approved');
  await f.store.update('approval_requests', change.id, {
    payload: { ...change.payload, locations: ['Chattogram'] },
  });
  await assert.rejects(f.platform.executeApproved(change.id, 'update_ad_set'), {
    code: 'ACTION_TAMPERED',
  });
  await f.close();
});

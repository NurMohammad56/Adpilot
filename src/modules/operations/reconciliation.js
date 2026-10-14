import { assert, now, hash } from '../../utils/core.js';
import { compareManualCampaign } from '../campaigns/manual-launch.js';
export async function reconcileCampaign(platform, user, kind, id) {
  const record = await platform.owned(
    kind === 'manual' ? 'manual_campaigns' : 'campaigns',
    id,
    user,
  );
  const approval = await platform.owned('approval_requests', record.approvalId, user);
  const integration = await platform.integration(user.businessId);
  assert(
    record.metaCampaignId && integration,
    409,
    'INTEGRATION_REQUIRED',
    'A linked campaign and Meta account are required.',
  );
  assert(
    record.accountId
      ? record.accountId === integration.adAccountId
      : approval.snapshot.integrationHash ===
          hash({
            adAccountId: integration.adAccountId,
            pageId: integration.pageId,
            pixelId: integration.pixelId,
            locationMap: integration.locationMap,
          }),
    409,
    'ACCOUNT_CHANGED',
    'Reconnect the original campaign ad account before checking it.',
  );
  let result;
  try {
    const remote = await platform.meta.inspectManualCampaign(record.metaCampaignId, integration);
    const baseline = structuredClone(approval.snapshot);
    if (kind !== 'manual') {
      baseline.budgetRecommendation.dailyBudget = record.dailyBudget;
      if (record.audience)
        baseline.audienceRecommendation = {
          ...baseline.audienceRecommendation,
          ...record.audience,
        };
      const localAds = await platform.store.list('ads', {
        businessId: user.businessId,
        campaignId: record.id,
      });
      for (const local of localAds)
        if (local.currentCreative) {
          const ad = baseline.ads.find((r) => r.id === local.id);
          if (ad) Object.assign(ad, local.currentCreative);
        }
    }
    result = compareManualCampaign(baseline, integration, remote);
    if (kind !== 'manual' && ['active', 'paused'].includes(record.status))
      result.checks.push({
        field: 'Campaign status',
        matches: remote.campaign.status === (record.status === 'active' ? 'ACTIVE' : 'PAUSED'),
        expected: record.status === 'active' ? 'ACTIVE' : 'PAUSED',
        actual: remote.campaign.status,
      });
    result.status = result.checks.every((c) => c.matches) ? 'settings_match' : 'mismatch';
  } catch (error) {
    if (!error.code || error.status < 400) throw error;
    result = {
      status: 'unverified',
      checkedAt: now(),
      checks: [],
      pending: [error.message],
      errorCode: error.code,
    };
  }
  await platform.store.transaction(async () => {
    const latest = await platform.owned(
      kind === 'manual' ? 'manual_campaigns' : 'campaigns',
      id,
      user,
    );
    assert(
      latest.updatedAt === record.updatedAt,
      409,
      'CAMPAIGN_CHANGED',
      'Campaign changed while checking Meta. Run a fresh check.',
    );
    await platform.store.update(kind === 'manual' ? 'manual_campaigns' : 'campaigns', id, {
      reconciliation: result,
    });
    await platform.audit(user, 'campaign.read_only_reconciled', id, {
      kind,
      status: result.status,
    });
  });
  return result;
}

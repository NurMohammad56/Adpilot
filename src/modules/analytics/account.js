import { assert, now } from '../../utils/core.js';

export async function accountSnapshot(platform, user) {
  const previous = await latestAccountSnapshot(platform, user);
  if (previous && Date.now() - Date.parse(previous.checkedAt) < 60000)
    return { ...previous, cached: true };
  const integration = await platform.integration(user.businessId);
  assert(
    platform.config.mode === 'demo' || integration?.verifiedAt,
    409,
    'INTEGRATION_REQUIRED',
    'Connect Meta before checking your ad account',
  );
  const snapshot = await platform.meta.accountSnapshot(integration);
  const data = {
    ...snapshot,
    businessId: user.businessId,
    accountId: integration?.adAccountId || 'demo',
    checkedAt: now(),
  };
  const saved = previous
    ? await platform.store.update('account_snapshots', previous.id, data)
    : await platform.store.insert('account_snapshots', data);
  await platform.audit(user, 'meta.account_checked', saved.id, {
    campaignCount: snapshot.campaigns.length,
  });
  return saved;
}

export async function latestAccountSnapshot(platform, user) {
  const integration = await platform.integration(user.businessId);
  const rows = await platform.store.list('account_snapshots', {
    businessId: user.businessId,
    accountId: integration?.adAccountId || 'demo',
  });
  return rows.sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0] || null;
}

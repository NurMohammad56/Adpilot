import { assert, hash, now } from '../../utils/core.js';

const keys = (values) =>
  (values || [])
    .map((v) => String(v.key ?? v))
    .sort()
    .join('|');
export function compareManualCampaign(plan, integration, remote) {
  const checks = [],
    pending = [
      'Confirm uploaded image/video, cover, placement previews and functioning website events in Ads Manager. Media bytes and tracking delivery are not verified by this check.',
    ];
  const check = (field, matches, expected, actual) =>
    checks.push({ field, matches, expected, actual });
  check(
    'Objective',
    remote.campaign.objective === plan.objective,
    plan.objective,
    remote.campaign.objective,
  );
  check(
    'Currency',
    remote.account.currency === (plan.accountCurrency || integration.currency),
    plan.accountCurrency || integration.currency,
    remote.account.currency,
  );
  check('Ad set count', remote.adSets.length === 1, 1, remote.adSets.length);
  check(
    'Campaign budget disabled',
    !Number(remote.campaign.daily_budget || 0) && !Number(remote.campaign.lifetime_budget || 0),
    'Ad set budget',
    Number(remote.campaign.daily_budget || remote.campaign.lifetime_budget || 0) / 100,
  );
  const audience = plan.audienceRecommendation,
    b = plan.budgetRecommendation;
  const expectedGeo = audience.geoTargets?.length
    ? {
        regions: audience.geoTargets.filter((t) => t.type === 'region'),
        cities: audience.geoTargets.filter((t) => t.type === 'city'),
      }
    : plan.kind === 'service' || audience.locations.includes('Nationwide')
      ? { countries: plan.kind === 'service' ? audience.locations : ['BD'] }
      : {
          regions: audience.locations
            .map((n) => integration.locationMap?.[n])
            .filter((t) => t?.type === 'region'),
          cities: audience.locations
            .map((n) => integration.locationMap?.[n])
            .filter((t) => t?.type === 'city'),
        };
  for (const set of remote.adSets) {
    const geo = set.targeting?.geo_locations || {};
    check(
      'Locations',
      ['countries', 'regions', 'cities'].every((k) => keys(geo[k]) === keys(expectedGeo[k])) &&
        !geo.zips?.length &&
        !geo.custom_locations?.length &&
        !Object.keys(set.targeting?.excluded_geo_locations || {}).length,
      audience.geoTargets?.map((t) => t.name) || audience.locations,
      geo,
    );
    check(
      'Age',
      set.targeting?.age_min === audience.ageMin && set.targeting?.age_max === audience.ageMax,
      `${audience.ageMin}-${audience.ageMax}`,
      `${set.targeting?.age_min}-${set.targeting?.age_max}`,
    );
    check(
      'Placements',
      keys(set.targeting?.publisher_platforms) === keys(['facebook', 'instagram']) &&
        keys(set.targeting?.device_platforms) === keys(['mobile', 'desktop']),
      'Facebook + Instagram; mobile + desktop',
      set.targeting?.publisher_platforms || [],
    );
    check(
      'Broad audience',
      !set.targeting?.interests?.length &&
        !set.targeting?.flexible_spec?.length &&
        !set.targeting?.custom_audiences?.length &&
        !set.targeting?.excluded_custom_audiences?.length,
      'No additional targeting',
      Boolean(
        set.targeting?.flexible_spec?.length ||
        set.targeting?.interests?.length ||
        set.targeting?.custom_audiences?.length,
      ),
    );
    check(
      'Pixel and event',
      set.promoted_object?.pixel_id === integration.pixelId &&
        set.promoted_object?.custom_event_type === plan.conversionEvent,
      `${integration.pixelId} / ${plan.conversionEvent}`,
      `${set.promoted_object?.pixel_id} / ${set.promoted_object?.custom_event_type}`,
    );
    check(
      'Optimization',
      set.optimization_goal === 'OFFSITE_CONVERSIONS',
      'OFFSITE_CONVERSIONS',
      set.optimization_goal,
    );
    const lifetime = b.deliveryMode === 'lifetime';
    check(
      'Budget',
      Number(set[lifetime ? 'lifetime_budget' : 'daily_budget']) ===
        Math.round((lifetime ? b.totalBudget : b.dailyBudget) * 100) &&
        !Number(set[lifetime ? 'daily_budget' : 'lifetime_budget'] || 0),
      `${lifetime ? b.totalBudget : b.dailyBudget} ${plan.accountCurrency || integration.currency}`,
      Number(set[lifetime ? 'lifetime_budget' : 'daily_budget'] || 0) / 100,
    );
    const days = (Date.parse(set.end_time) - Date.parse(set.start_time)) / 86400000;
    check(
      'Duration',
      Number.isFinite(days) && Math.abs(days - b.durationDays) < 1 / 1440,
      b.durationDays,
      Number.isFinite(days) ? days : null,
    );
    if (set.targeting?.targeting_automation?.advantage_audience)
      pending.push(
        'Advantage audience is enabled; review which age and audience entries are suggestions versus controls.',
      );
  }
  check(
    'Creative count',
    remote.ads.length === plan.ads.length,
    plan.ads.length,
    remote.ads.length,
  );
  const unmatched = [...plan.ads];
  for (const ad of remote.ads) {
    const story = ad.creative?.object_story_spec;
    const data = story?.link_data || story?.video_data;
    if (!data) {
      pending.push(
        `Creative ${ad.id}: Meta did not return comparable ad copy/identity; verify it manually.`,
      );
      continue;
    }
    const link = data.link || data.call_to_action?.value?.link;
    const index = unmatched.findIndex(
      (p) =>
        p.headline === (data.name || data.title) &&
        p.primaryText === data.message &&
        (p.cta || 'SHOP_NOW') === data.call_to_action?.type,
    );
    check(
      `Creative ${ad.id}`,
      index >= 0 && story.page_id === integration.pageId && link === plan.landingUrl,
      'Reviewed copy, CTA, Page and destination',
      { pageId: story.page_id, link, headline: data.name || data.title },
    );
    if (index >= 0) unmatched.splice(index, 1);
  }
  return {
    status: checks.every((c) => c.matches) ? 'settings_match' : 'mismatch',
    checks,
    pending,
    checkedAt: now(),
    source: 'Meta read-only API',
    effectiveStatus: remote.campaign.effective_status || remote.campaign.status,
    demo: false,
  };
}

export async function linkManualCampaign(
  platform,
  user,
  approvalId,
  metaCampaignId,
  replaceUnverified = false,
) {
  const approval = await platform.owned('approval_requests', approvalId, user);
  assert(
    approval.action === 'manual_campaign' && approval.status === 'approved',
    409,
    'MANUAL_APPROVAL_REQUIRED',
    'Approve the manual guide before linking a Facebook campaign.',
  );
  assert(
    hash(approval.snapshot) === approval.snapshotHash,
    409,
    'SNAPSHOT_TAMPERED',
    'Approval snapshot changed',
  );
  const existing = await platform.store.find('manual_campaigns', {
    businessId: user.businessId,
    planId: approval.planId,
  });
  assert(
    !existing ||
      existing.metaCampaignId === metaCampaignId ||
      (replaceUnverified && existing.verification.status === 'unverified'),
    409,
    'MANUAL_ALREADY_LINKED',
    'This plan is already linked to another campaign. Review a new plan for a different campaign.',
  );
  if (!existing) {
    assert(
      Date.parse(approval.expiresAt) > Date.now(),
      409,
      'APPROVAL_EXPIRED',
      'The guide approval has expired. Prepare a new reviewed plan before linking.',
    );
    await platform.assertFresh(approval.snapshot, user);
  }
  const integration = await platform.integration(user.businessId);
  assert(
    !existing || existing.accountId === integration?.adAccountId,
    409,
    'MANUAL_ACCOUNT_MISMATCH',
    'Reconnect the account used by this linked campaign before checking it.',
  );
  assert(
    platform.config.mode === 'live' && integration?.verifiedAt,
    409,
    'LIVE_READ_REQUIRED',
    'A verified live Meta account is needed to check a real campaign.',
  );
  let verification;
  try {
    const remote = await platform.meta.inspectManualCampaign(metaCampaignId, integration);
    verification = {
      ...compareManualCampaign(approval.snapshot, integration, remote),
      insights: remote.insights || null,
      insightsIssue: remote.insightsIssue || null,
    };
  } catch (error) {
    // An explicitly confirmed account mismatch must never bind another account's campaign.
    if (error.code === 'MANUAL_ACCOUNT_MISMATCH') throw error;
    if (!['META_REJECTED', 'META_AMBIGUOUS', 'MANUAL_READ_INCOMPLETE'].includes(error.code))
      throw error;
    verification = {
      status: 'unverified',
      checkedAt: now(),
      checks: [],
      pending: [error.message],
      metaCode: error.details?.metaCode,
      source: 'User-supplied campaign ID; Meta verification failed',
      effectiveStatus: null,
      demo: false,
    };
  }
  return platform.store.transaction(async () => {
    // Serialize competing links with other launch/budget transactions.
    const business = await platform.store.get('businesses', user.businessId);
    await platform.store.update('businesses', business.id, {
      budgetVersion: (business.budgetVersion || 0) + 1,
    });
    const current = await platform.store.find('manual_campaigns', {
      businessId: user.businessId,
      planId: approval.planId,
    });
    if (!current) await platform.assertFresh(approval.snapshot, user);
    const conflict = await platform.store.find('manual_campaigns', {
      businessId: user.businessId,
      metaCampaignId,
    });
    assert(
      !conflict || conflict.planId === approval.planId,
      409,
      'MANUAL_ALREADY_LINKED',
      'This campaign is already linked to another reviewed plan.',
    );
    assert(
      !current ||
        current.metaCampaignId === metaCampaignId ||
        (replaceUnverified && current.verification.status === 'unverified'),
      409,
      'MANUAL_ALREADY_LINKED',
      'This plan is already linked to another campaign.',
    );
    const values = {
      businessId: user.businessId,
      planId: approval.planId,
      approvalId,
      metaCampaignId,
      accountId: integration.adAccountId,
      name: approval.snapshot.name,
      dailyBudget: approval.snapshot.budgetRecommendation.dailyBudget,
      totalBudget: approval.snapshot.budgetRecommendation.totalBudget,
      verification,
      reportedBy: current?.reportedBy || user.id,
      priorReportedIds: [
        ...(current?.priorReportedIds || []),
        ...(current && current.metaCampaignId !== metaCampaignId
          ? [{ metaCampaignId: current.metaCampaignId, correctedAt: now(), correctedBy: user.id }]
          : []),
      ],
    };
    const record = current
      ? await platform.store.update('manual_campaigns', current.id, values)
      : await platform.store.insert('manual_campaigns', values);
    await platform.audit(user, 'manual_campaign.checked', record.id, {
      metaCampaignId,
      status: verification.status,
      planId: approval.planId,
    });
    return record;
  });
}

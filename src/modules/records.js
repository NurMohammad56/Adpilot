import { assert, hash, now } from '../utils/core.js';
import { invalidateAdLibraryReports } from './research/ad-library.js';

// Only user-managed records are exposed. Authentication and audit records are not data controls.
export const recordKinds = {
  'ad-library': ['ad_library_observations', 'Saved competitor ads'],
  products: ['products', 'Products'],
  services: ['service_profiles', 'Services'],
  media: ['media_assets', 'Media files'],
  plans: ['campaign_plans', 'Campaign plans'],
  approvals: ['approval_requests', 'Approvals'],
  research: ['research_projects', 'Research briefs'],
  'research-versions': ['research_versions', 'Research reports'],
  discovery: ['product_discoveries', 'Product idea reports'],
  campaigns: ['campaigns', 'Campaign records'],
  'manual-campaigns': ['manual_campaigns', 'Linked manual campaigns'],
  optimizations: ['optimization_recommendations', 'Optimization suggestions'],
  evidence: ['market_research_reports', 'Saved product evidence'],
  outcomes: ['business_outcomes', 'Recorded leads and orders'],
  feeds: ['catalog_feeds', 'Catalogue feeds'],
  creatives: ['creatives', 'Saved creatives'],
  'ad-sets': ['ad_sets', 'Ad set records'],
  ads: ['ads', 'Ad records'],
  performance: ['ad_performance', 'Performance snapshots'],
  jobs: ['jobs', 'Background tasks'],
  locations: ['targeting_locations', 'Saved targeting locations'],
  offers: ['offers', 'Saved offers'],
  'account-checks': ['account_snapshots', 'Account checks'],
  'launch-checks': ['campaign_launch_checks', 'Launch checks'],
  'visual-analyses': ['visual_analyses', 'Image analyses'],
  translations: ['report_translations', 'Report translations'],
  cache: ['research_cache', 'Reusable research results'],
  integrations: ['integrations', 'Account connections'],
};
const extra = [
  'product_costs',
  'competitors',
  'audience_recommendations',
  'pricing_recommendations',
  'budget_recommendations',
  'campaign_strategies',
  'approval_actions',
  'ai_decisions',
  'ad_library_history',
];
const label = (collection) =>
  Object.values(recordKinds).find(([c]) => c === collection)?.[1] ||
  collection.replaceAll('_', ' ');
const contains = (value, ids, keys) => {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => contains(item, ids, keys));
  return Object.entries(value).some(
    ([key, item]) =>
      (keys.includes(key) &&
        (Array.isArray(item) ? item.some((id) => ids.has(id)) : ids.has(item))) ||
      contains(item, ids, keys),
  );
};
const mediaKeys = [
  'mediaAssetId',
  'mediaAssetIds',
  'thumbnailAssetId',
  'screenshotAssetIds',
  'assetId',
];
const recordName = (row) =>
  row.name ||
  row.pageName ||
  row.advertiserName ||
  row.reference ||
  row.action ||
  row.type ||
  row.kind ||
  row.task ||
  row.provider ||
  row.id;
const admin = (user) =>
  assert(
    user.role === 'admin',
    403,
    'ROLE_REQUIRED',
    'Only workspace administrators can delete saved records.',
  );

export async function listManagedRecords(platform, user, kind) {
  admin(user);
  if (!kind) return Object.entries(recordKinds).map(([kind, [, label]]) => ({ kind, label }));
  const definition = recordKinds[kind];
  assert(definition, 404, 'NOT_FOUND', 'Record type not found.');
  return (await platform.store.list(definition[0], { businessId: user.businessId }))
    .filter((row) => !row.deletedAt)
    .map((row) => ({
      id: row.id,
      name: recordName(row),
      status: row.status || 'saved',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function prepare(platform, user, kind, id) {
  admin(user);
  const collection = recordKinds[kind]?.[0];
  assert(collection, 404, 'NOT_FOUND', 'Record type not found.');
  const root = await platform.owned(collection, id, user);
  assert(!root.deletedAt, 404, 'NOT_FOUND', 'Record not found.');
  const names = [...new Set([...Object.values(recordKinds).map(([c]) => c), ...extra])];
  const entries = await Promise.all(
    names.map(async (name) => [
      name,
      await platform.store.list(name, { businessId: user.businessId }),
    ]),
  );
  const all = Object.fromEntries(entries);
  const selected = new Map(names.map((name) => [name, new Set()]));
  selected.get(collection).add(id);
  const marked = (name) => selected.get(name);
  const add = (name, predicate) => {
    for (const row of all[name]) if (!row.deletedAt && predicate(row)) marked(name).add(row.id);
  };
  const edges = {
    service_profiles: {
      research_projects: ['serviceProfileId'],
      offers: ['serviceProfileId'],
      campaign_plans: ['serviceProfileId'],
    },
    products: {
      product_costs: ['productId'],
      market_research_reports: ['productId', 'productIds'],
      research_projects: ['productId'],
      campaign_plans: ['productId', 'productIds'],
      catalog_feeds: ['productIds'],
      visual_analyses: ['productId'],
      creatives: ['productId'],
      pricing_recommendations: ['productId'],
      audience_recommendations: ['productId'],
      budget_recommendations: ['productId'],
      campaign_strategies: ['productId'],
      competitors: ['productId'],
    },
    research_projects: {
      research_versions: ['projectId'],
      campaign_plans: ['researchProjectId'],
      offers: ['researchProjectId', 'projectId'],
    },
    research_versions: {
      campaign_plans: ['researchVersionId'],
      offers: ['researchVersionId', 'versionId'],
    },
    campaign_plans: {
      approval_requests: ['planId'],
      campaigns: ['planId'],
      manual_campaigns: ['planId'],
      market_research_reports: ['planId'],
      competitors: ['planId'],
      audience_recommendations: ['planId'],
      pricing_recommendations: ['planId'],
      budget_recommendations: ['planId'],
      campaign_strategies: ['planId'],
      creatives: ['planId'],
      ai_decisions: ['planId'],
      campaign_launch_checks: ['planId'],
    },
    campaigns: {
      ad_sets: ['campaignId'],
      ads: ['campaignId'],
      ad_performance: ['campaignId'],
      optimization_recommendations: ['campaignId'],
      approval_requests: ['campaignId'],
      business_outcomes: ['campaignId'],
      campaign_launch_checks: ['campaignId'],
    },
    ad_sets: { ads: ['adSetId', 'adsetId'] },
    approval_requests: { approval_actions: ['approvalId'] },
    optimization_recommendations: { approval_requests: ['optimizationId'] },
    ad_library_observations: { ad_library_history: ['observationId'] },
  };
  let count = -1;
  while (count !== [...selected.values()].reduce((sum, ids) => sum + ids.size, 0)) {
    count = [...selected.values()].reduce((sum, ids) => sum + ids.size, 0);
    for (const [parent, children] of Object.entries(edges)) {
      if (!marked(parent).size) continue;
      for (const [child, keys] of Object.entries(children))
        add(child, (row) => contains(row, marked(parent), keys));
    }
    if (marked('media_assets').size) {
      for (const name of ['campaign_plans', 'creatives', 'visual_analyses'])
        add(
          name,
          (row) =>
            contains(row, marked('media_assets'), mediaKeys) ||
            row.assets?.some((asset) => marked('media_assets').has(asset.id)),
        );
      const productImages = new Set(
        all.products
          .filter((row) => contains(row, marked('media_assets'), mediaKeys))
          .map((row) => row.id),
      );
      add('catalog_feeds', (row) => contains(row, productImages, ['productIds']));
    }
    const ids = new Set([...selected.values()].flatMap((set) => [...set]));
    add('report_translations', (row) => ids.has(row.recordId));
    add(
      'jobs',
      (row) =>
        contains(row, ids, [
          'targetId',
          'observationId',
          'productId',
          'productIds',
          'planId',
          'campaignId',
          'projectId',
          'versionId',
          'reportId',
          'adLibraryIds',
          ...mediaKeys,
        ]) ||
        [...selected].some(([name, selectedIds]) =>
          all[name].some(
            (selectedRow) => selectedIds.has(selectedRow.id) && selectedRow.jobId === row.id,
          ),
        ),
    );
  }
  const updates = [];
  const patch = (name, row, changes) => {
    if (!marked(name).has(row.id) && Object.keys(changes).length) {
      const previous = updates.find((item) => item.collection === name && item.id === row.id);
      if (previous) Object.assign(previous.changes, changes);
      else updates.push({ collection: name, id: row.id, before: hash(row), changes });
    }
  };
  const removeIds = (values, ids) => (values || []).filter((id) => !ids.has(id));
  // Keep independently saved ads; unlink deleted products/briefs instead of discarding evidence.
  for (const row of all.ad_library_observations) {
    const changes = {};
    if (marked('products').has(row.productId)) changes.productId = null;
    if (marked('research_projects').has(row.projectId)) changes.projectId = null;
    if (contains(row, marked('media_assets'), ['screenshotAssetIds'])) {
      changes.screenshotAssetIds = removeIds(row.screenshotAssetIds, marked('media_assets'));
      changes.analysis = null;
    }
    if (Object.keys(changes).length) {
      changes.snapshotHash = hash({ ...row, ...changes, snapshotHash: undefined });
      changes.revision = (row.revision || 1) + 1;
      changes.analysis = null;
      patch('ad_library_observations', row, changes);
    }
  }
  for (const row of all.products) {
    const changes = {};
    const sourceCollection = {
      research: 'research_projects',
      discovery: 'product_discoveries',
      'ad-library': 'ad_library_observations',
    }[row.sourceContext?.kind];
    if (sourceCollection && marked(sourceCollection)?.has(row.sourceContext.id))
      changes.sourceContext = null;
    if (marked('media_assets').has(row.mediaAssetId)) changes.mediaAssetId = null;
    if (marked('media_assets').has(row.thumbnailAssetId)) changes.thumbnailAssetId = null;
    for (const key of ['mediaAssetIds', 'adLibraryIds']) {
      const ids = marked(key === 'adLibraryIds' ? 'ad_library_observations' : 'media_assets');
      if (row[key]?.some((id) => ids.has(id))) changes[key] = removeIds(row[key], ids);
    }
    if (Object.keys(changes).length) changes.revision = (row.revision || 1) + 1;
    patch('products', row, changes);
  }
  const changedServices = new Set();
  for (const row of all.service_profiles) {
    const changes = {};
    if (marked('media_assets').has(row.mediaAssetId)) changes.mediaAssetId = null;
    if (marked('media_assets').has(row.thumbnailAssetId)) changes.thumbnailAssetId = null;
    if (row.adLibraryIds?.some((id) => marked('ad_library_observations').has(id)))
      changes.adLibraryIds = removeIds(row.adLibraryIds, marked('ad_library_observations'));
    if (row.candidateLocationIds?.some((id) => marked('targeting_locations').has(id)))
      changes.candidateLocationIds = removeIds(
        row.candidateLocationIds,
        marked('targeting_locations'),
      );
    if (Object.keys(changes).length) {
      changes.revision = (row.revision || 1) + 1;
      changedServices.add(row.id);
    }
    patch('service_profiles', row, changes);
  }
  for (const row of all.research_projects) {
    const changes = {};
    if (changedServices.has(row.serviceProfileId)) {
      changes.status = 'needs_research';
      changes.approvedVersionId = null;
      changes.serviceProfileInvalidatedAt = now();
      const version = all.research_versions.find((version) => version.id === row.currentVersionId);
      if (version)
        patch('research_versions', version, {
          serviceProfileInvalidatedAt: now(),
          staleReason: 'Saved service inputs were removed.',
        });
    }
    if (row.adLibraryIds?.some((id) => marked('ad_library_observations').has(id)))
      changes.adLibraryIds = removeIds(row.adLibraryIds, marked('ad_library_observations'));
    if (marked('product_discoveries').has(row.discoveryReportId)) {
      changes.discoveryReportId = null;
      changes.discoveryCandidateId = null;
    }
    if (row.candidateLocationIds?.some((id) => marked('targeting_locations').has(id))) {
      changes.candidateLocationIds = removeIds(
        row.candidateLocationIds,
        marked('targeting_locations'),
      );
      changes.approvedVersionId = null;
      changes.status = 'needs_research';
    }
    if (marked('research_versions').has(row.currentVersionId)) {
      changes.currentVersionId = null;
      changes.approvedVersionId = null;
      changes.status = 'draft';
      changes.revision = row.revision + 1;
    } else if (marked('research_versions').has(row.approvedVersionId)) {
      changes.approvedVersionId = null;
      changes.status = 'needs_research';
    }
    if (Object.keys(changes).length && !changes.revision) changes.revision = row.revision + 1;
    patch('research_projects', row, changes);
  }
  for (const row of all.research_versions)
    if (marked('research_versions').has(row.parentId))
      patch('research_versions', row, { parentId: null });
  for (const row of all.product_discoveries)
    if (row.input?.adLibraryIds?.some((id) => marked('ad_library_observations').has(id)))
      patch('product_discoveries', row, {
        input: {
          ...row.input,
          adLibraryIds: removeIds(row.input.adLibraryIds, marked('ad_library_observations')),
        },
        report: {
          ...row.report,
          adLibraryInvalidatedAt: true,
          staleReason: 'Saved competitor evidence was deleted.',
        },
      });
  const changedProducts = new Set(
    updates.filter((item) => item.collection === 'products').map((item) => item.id),
  );
  if (collection === 'market_research_reports' && root.type === 'evidence')
    changedProducts.add(root.productId);
  const staleReason =
    'Saved product facts or evidence were deleted. Generate fresh research and request a new review.';
  for (const project of all.research_projects)
    if (changedProducts.has(project.productId)) {
      patch('research_projects', project, {
        status: 'needs_research',
        approvedVersionId: null,
        staleReason,
      });
      if (project.currentVersionId) {
        const version = all.research_versions.find((v) => v.id === project.currentVersionId);
        if (version)
          patch('research_versions', version, { adLibraryInvalidatedAt: true, staleReason });
      }
    }
  for (const plan of all.campaign_plans) {
    if (
      ['executed', 'executing', 'superseded'].includes(plan.status) ||
      all.campaigns.some((c) => c.planId === plan.id && !c.deletedAt) ||
      all.manual_campaigns.some((c) => c.planId === plan.id)
    )
      continue;
    if (
      contains(plan, changedProducts, ['productId', 'productIds']) ||
      changedServices.has(plan.serviceProfileId) ||
      plan.audienceRecommendation?.geoTargets?.some((target) =>
        marked('targeting_locations').has(target.id),
      )
    ) {
      patch('campaign_plans', plan, {
        status: 'needs_research',
        adLibraryInvalidatedAt: true,
        staleReason,
      });
      for (const approval of all.approval_requests)
        if (approval.planId === plan.id && ['pending', 'approved'].includes(approval.status))
          patch('approval_requests', approval, { status: 'superseded', staleReason });
    }
  }
  for (const row of all.campaign_plans) {
    if (marked('campaign_plans').has(row.id)) continue;
    const requests = all.approval_requests.filter(
      (a) =>
        a.planId === row.id &&
        ['launch_campaign', 'manual_campaign'].includes(a.action) &&
        ['pending', 'approved'].includes(a.status),
    );
    if (
      requests.some((a) => marked('approval_requests').has(a.id)) &&
      !requests.some((a) => !marked('approval_requests').has(a.id)) &&
      !all.campaigns.some((c) => c.planId === row.id && !c.deletedAt) &&
      !all.manual_campaigns.some((c) => c.planId === row.id)
    )
      patch('campaign_plans', row, { status: 'draft' });
  }
  if (
    marked('products').size ||
    marked('service_profiles').size ||
    changedServices.size ||
    marked('research_projects').size ||
    marked('ad_library_observations').size ||
    marked('media_assets').size ||
    marked('product_discoveries').size ||
    collection === 'market_research_reports'
  ) {
    // Cached outputs can contain deleted private inputs, so discard workspace cache copies too.
    add('research_cache', () => true);
  }
  const rows = [...selected].flatMap(([name, ids]) =>
    all[name].filter((row) => ids.has(row.id)).map((row) => ({ collection: name, row })),
  );
  const blockers = [];
  const affectedIds = new Set(rows.map(({ row }) => row.id));
  const guardCampaign = (c) => {
    if (!c.deletedAt && ['active', 'provisioning', 'needs_reconciliation'].includes(c.status))
      blockers.push(
        'A linked campaign is active or needs reconciliation. Pause it and resolve its execution state before deleting these records.',
      );
  };
  for (const { collection: name, row } of rows) {
    if (name === 'campaigns') guardCampaign(row);
    if (name === 'approval_requests' && ['executing', 'needs_reconciliation'].includes(row.status))
      blockers.push(
        'An approval is executing or needs reconciliation. Resolve its execution before deleting it.',
      );
    if (name === 'jobs' && row.status === 'running')
      blockers.push('A related background task is running. Wait for it to finish, then retry.');
    if (name === 'media_assets' && row.status === 'uploading')
      blockers.push('This file is still uploading. Wait for the upload to finish.');
  }
  // Deleting approvals, creatives, metrics or outcomes must not erase an uncertain execution.
  for (const c of all.campaigns) {
    if (
      affectedIds.has(c.approvalId) ||
      affectedIds.has(c.planId) ||
      rows.some(
        ({ collection: name, row }) =>
          ['ads', 'ad_sets', 'creatives'].includes(name) &&
          (row.campaignId === c.id || row.planId === c.planId),
      )
    )
      guardCampaign(c);
  }
  if (collection === 'integrations' || collection === 'targeting_locations') {
    for (const c of all.campaigns) guardCampaign(c);
    if (all.approval_requests.some((a) => ['executing', 'needs_reconciliation'].includes(a.status)))
      blockers.push(
        'Resolve pending executions before disconnecting accounts or deleting targeting locations.',
      );
  }
  const counts = Object.entries(Object.groupBy(rows, ({ collection }) => collection)).map(
    ([collection, items]) => ({ label: label(collection), count: items.length }),
  );
  const token = hash({
    kind,
    id,
    rows: rows
      .map(({ collection, row }) => [collection, row.id, hash(row)])
      .sort((a, b) => `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`)),
    updates: [...updates].sort((a, b) =>
      `${a.collection}:${a.id}`.localeCompare(`${b.collection}:${b.id}`),
    ),
    blockers,
  });
  return {
    root,
    rows,
    updates,
    selected,
    preview: {
      kind,
      id,
      name: recordName(root),
      token,
      counts,
      total: rows.length,
      unlinkedRecords: updates.length,
      blockers: [...new Set(blockers)],
      remoteUnchanged: rows.some(({ collection }) =>
        ['campaigns', 'manual_campaigns', 'ads', 'ad_sets', 'catalog_feeds'].includes(collection),
      ),
      files: marked('media_assets').size,
    },
  };
}

export async function deletionPreview(platform, user, kind, id) {
  return (await prepare(platform, user, kind, id)).preview;
}

// File deletion is an outbox: metadata stays inaccessible until storage succeeds.
// A worker retries pending files after a storage outage or process restart.
export async function cleanupDeletedMedia(platform, businessId) {
  const rows = await platform.store.list('media_assets', {
    status: 'deleting',
    ...(businessId ? { businessId } : {}),
  });
  let pending = 0;
  for (const row of rows) {
    try {
      assert(
        row.storageDriver === platform.media.storage.driver,
        503,
        'STORAGE_CONFIG',
        'Storage driver changed.',
      );
      await platform.media.storage.remove(row.storageKey);
      await platform.store.transaction(async () => {
        const latest = await platform.store.get('media_assets', row.id);
        if (latest?.status === 'deleting') await platform.store.remove('media_assets', row.id);
      });
    } catch {
      pending++;
    }
  }
  return { pending };
}

export async function deleteManagedRecord(platform, user, kind, id, token) {
  const result = await platform.store.transaction(async () => {
    const work = await prepare(platform, user, kind, id);
    assert(
      work.preview.token === token,
      409,
      'DELETE_CHANGED',
      'This record or its linked items changed. Open the deletion review again.',
    );
    assert(!work.preview.blockers.length, 409, 'DELETE_BLOCKED', work.preview.blockers[0]);
    const deletedAt = now();
    // Serialize with quota/reservation changes in Mongo transactions.
    const business = await platform.store.get('businesses', user.businessId);
    await platform.store.update('businesses', business.id, {
      dataDeletionVersion: (business.dataDeletionVersion || 0) + 1,
      mediaQuotaVersion: (business.mediaQuotaVersion || 0) + 1,
    });
    for (const { collection, id, changes } of work.updates)
      await platform.store.update(collection, id, changes);
    for (const { collection, row } of work.rows) {
      if (collection === 'media_assets')
        await platform.store.update(collection, row.id, { status: 'deleting', deletedAt });
      else if (['campaigns', 'jobs'].includes(collection))
        // Retain campaign budget reservations and queue tombstones; neither can execute again.
        await platform.store.update(collection, row.id, { status: 'deleted', deletedAt });
      else await platform.store.remove(collection, row.id);
    }
    if (
      work.selected.get('ad_library_observations').size ||
      work.selected.get('media_assets').size ||
      work.selected.get('products').size ||
      work.selected.get('research_projects').size
    )
      await invalidateAdLibraryReports(platform, user);
    await platform.audit(user, 'record.deleted', id, {
      kind,
      name: recordName(work.root),
      counts: work.preview.counts,
      unlinkedRecords: work.updates.length,
      remoteUnchanged: work.preview.remoteUnchanged,
    });
    return work.preview;
  });
  const cleanup = await cleanupDeletedMedia(platform, user.businessId);
  return { success: true, ...result, cleanupPending: cleanup.pending };
}

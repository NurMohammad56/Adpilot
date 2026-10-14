import { assert, hash, now } from '../../utils/core.js';

const collections = {
  research: 'research_projects',
  discovery: 'product_discoveries',
  'ad-library': 'ad_library_observations',
};

export async function resolveProductSource(platform, user, reference) {
  if (!reference) return null;
  const row = await platform.owned(collections[reference.kind], reference.id, user);
  if (reference.kind === 'research')
    assert(
      row.kind === 'physical-product',
      422,
      'PRODUCT_SOURCE_KIND',
      'Choose physical product research. Digital services belong in Research studio.',
    );
  if (reference.kind === 'discovery')
    assert(
      row.report?.candidates?.some((candidate) => candidate.id === reference.candidateId),
      404,
      'PRODUCT_SOURCE_CANDIDATE',
      'This product idea is no longer available.',
    );
  if (reference.kind === 'ad-library')
    assert(
      !row.archived,
      409,
      'PRODUCT_SOURCE_ARCHIVED',
      'Restore this saved ad before using it as a new product source.',
    );
  return row;
}

export async function campaignProductSources(platform, user) {
  const names = [
    'products',
    'research_projects',
    'product_discoveries',
    'ad_library_observations',
    'media_assets',
  ];
  const values = await Promise.all(
    names.map((name) => platform.store.list(name, { businessId: user.businessId })),
  );
  const [products, projects, discoveries, observations, media] = values.map((rows) =>
    rows.filter((row) => !row.deletedAt),
  );
  const ads = observations.filter((row) => !row.archived);
  const activeIds = new Set(ads.map((row) => row.id));
  const sources = [];
  const add = (reference, name, status, draft, linkedId, countries = []) => {
    const match =
      products.find((product) => linkedId === product.id) ||
      products.find((product) => hash(product.sourceContext || null) === hash(reference));
    sources.push({
      key: `${reference.kind}:${reference.id}:${reference.candidateId || ''}`,
      reference,
      name,
      status,
      countries,
      existingProductId: match?.id || null,
      draft: {
        ...draft,
        draftId:
          reference.kind === 'ad-library'
            ? `ad-library-${reference.id}`
            : reference.kind === 'discovery'
              ? reference.candidateId
              : `source-research-${reference.id}-`,
        sourceContext: reference,
        sourceLabel: name,
        sourceKind: reference.kind,
        adLibraryIds: [...new Set(draft.adLibraryIds || [])]
          .filter((id) => activeIds.has(id))
          .slice(0, 12),
      },
    });
  };
  for (const row of projects.filter((row) => row.kind === 'physical-product'))
    add(
      { kind: 'research', id: row.id },
      row.name,
      row.adLibraryInvalidatedAt ? 'needs_research' : row.status,
      {
        name: row.name,
        category: row.productCategory || '',
        description: row.description,
        adLibraryIds: [
          ...(row.adLibraryIds || []),
          ...ads.filter((ad) => ad.projectId === row.id).map((ad) => ad.id),
        ],
      },
      row.productId,
      row.candidateCountries,
    );
  for (const row of discoveries)
    for (const candidate of row.report?.candidates || [])
      add(
        { kind: 'discovery', id: row.id, candidateId: candidate.id },
        candidate.name,
        'idea',
        {
          name: candidate.name,
          category: candidate.category || '',
          description: '',
          adLibraryIds: row.input?.adLibraryIds || [],
        },
        null,
        [row.input?.country].filter(Boolean),
      );
  for (const row of ads)
    add(
      { kind: 'ad-library', id: row.id },
      row.pageName,
      'competitor_evidence',
      { adLibraryIds: [row.id] },
      row.productId,
      [row.country],
    );
  return {
    products: products
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((product) => {
        const asset = media.find((item) => item.id === product.mediaAssetId);
        const missing = [];
        if (!(product.sellingPrice > 0)) missing.push('selling price');
        if (!(product.inventory > 0)) missing.push('stock');
        if (!product.landingUrl?.startsWith('https://')) missing.push('product page');
        if (!(
          (asset?.type === 'image' && asset.status === 'ready') ||
          (!product.mediaAssetId && product.imageUrl)
        ))
          missing.push('product image');
        return { ...product, carouselMissing: missing };
      }),
    sources,
  };
}

// Earlier decisions are reusable context, not verified demand or approval for a new campaign.
export async function savedProductResearch(platform, user, products, { excludeProjectId } = {}) {
  const projects = await platform.store.list('research_projects', { businessId: user.businessId });
  const rows = [];
  const take = (value) => String(value || '').slice(0, 1800);
  for (const product of products) {
    const references = new Map();
    if (product.sourceContext && product.sourceContext.kind !== 'ad-library')
      references.set(hash(product.sourceContext), product.sourceContext);
    for (const project of projects.filter(
      (project) => project.kind === 'physical-product' && project.productId === product.id,
    )) {
      const reference = { kind: 'research', id: project.id };
      references.set(hash(reference), reference);
    }
    for (const reference of references.values()) {
      if (reference.kind === 'research' && reference.id === excludeProjectId) continue;
      const source = await platform.store.get(collections[reference.kind], reference.id);
      if (!source || source.deletedAt || source.businessId !== user.businessId) {
        rows.push({
          productId: product.id,
          reference,
          status: 'unavailable',
          fingerprint: hash(null),
        });
        continue;
      }
      const version =
        reference.kind === 'research' && source.currentVersionId
          ? await platform.store.get('research_versions', source.currentVersionId)
          : null;
      const report =
        version?.businessId === user.businessId && !version.deletedAt
          ? version.report
          : reference.kind === 'discovery'
            ? source.report
            : null;
      const candidate =
        reference.kind === 'discovery'
          ? report?.candidates?.find((item) => item.id === reference.candidateId)
          : null;
      rows.push({
        productId: product.id,
        reference,
        name: source.name || candidate?.name || product.name,
        versionId: version?.id || null,
        generatedAt: version?.createdAt || source.createdAt,
        status: source.adLibraryInvalidatedAt
          ? 'needs_research'
          : version?.status || source.status || 'idea',
        fingerprint: hash({ source, version: version || null }),
        summary: take(candidate ? candidate.reason : report?.summary),
        recommendation: report?.recommendation || null,
        findings: (reference.kind === 'research'
          ? [...(source.evidence || []), ...(report?.findings || [])]
          : source.input?.observations || []
        ).slice(0, 12),
        competitors: (candidate?.competitors || report?.competitorCandidates || []).slice(0, 5),
        risks: (candidate?.risks || report?.openQuestions || []).slice(0, 8),
        classification:
          'Earlier research context. Approval applies to its original decision only. Recheck dates, product comparability, Bangladesh suitability and current evidence; do not treat hypotheses as proven demand.',
      });
    }
  }
  return rows;
}

export const productResearchFingerprint = (rows) =>
  hash(
    rows
      .map(({ productId, reference, fingerprint }) => ({ productId, reference, fingerprint }))
      .sort((a, b) => hash(a).localeCompare(hash(b))),
  );

export async function assertSavedProductResearchFresh(platform, user, products, report) {
  if (!report?.productResearchFingerprint) return;
  assert(
    productResearchFingerprint(await savedProductResearch(platform, user, products)) ===
      report.productResearchFingerprint,
    409,
    'PRODUCT_RESEARCH_CHANGED',
    'Linked product research changed. Research a new carousel plan and request a fresh approval.',
  );
}

export async function invalidateSavedProductResearchPlans(platform, user) {
  const plans = await platform.store.list('campaign_plans', {
    businessId: user.businessId,
    kind: 'product-group',
  });
  for (const plan of plans) {
    if (
      !plan.research?.productResearchFingerprint ||
      plan.productResearchInvalidatedAt ||
      plan.deletedAt ||
      !['draft', 'rejected', 'pending_approval', 'approved'].includes(plan.status)
    )
      continue;
    if (
      (await platform.store.find('campaigns', { businessId: user.businessId, planId: plan.id })) ||
      (await platform.store.find('manual_campaigns', {
        businessId: user.businessId,
        planId: plan.id,
      }))
    )
      continue;
    const products = await Promise.all(
      plan.productIds.map((id) => platform.store.get('products', id)),
    );
    if (
      products.some(
        (product) => !product || product.deletedAt || product.businessId !== user.businessId,
      )
    )
      continue;
    if (
      productResearchFingerprint(await savedProductResearch(platform, user, products)) ===
      plan.research.productResearchFingerprint
    )
      continue;
    const stamp = now(),
      reason =
        'Linked product research changed. Research a new carousel plan and request a fresh approval.';
    await platform.store.update('campaign_plans', plan.id, {
      status: 'needs_research',
      productResearchInvalidatedAt: stamp,
      staleReason: reason,
    });
    for (const approval of await platform.store.list('approval_requests', {
      businessId: user.businessId,
      planId: plan.id,
    })) {
      if (
        ['pending', 'approved'].includes(approval.status) &&
        ['launch_campaign', 'manual_campaign'].includes(approval.action)
      )
        await platform.store.update('approval_requests', approval.id, {
          status: 'superseded',
          supersededAt: stamp,
          staleReason: reason,
        });
    }
    await platform.audit(user, 'campaign.product_research_changed', plan.id);
  }
}

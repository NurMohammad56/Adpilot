import { z } from 'zod';
import { countryNames } from './countries.js';

export const marketEvidenceQuery = z
  .object({
    country: z.enum(['ALL', ...Object.keys(countryNames)]).default('BD'),
    productId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    q: z.string().trim().max(150).default(''),
  })
  .strict();
const norm = (s) =>
  String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .trim();
export async function marketEvidence(platform, user, input = {}) {
  const query = marketEvidenceQuery.parse(input);
  const product = query.productId ? await platform.owned('products', query.productId, user) : null;
  const project = query.projectId
    ? await platform.owned('research_projects', query.projectId, user)
    : null;
  const linked =
    !product && project?.productId
      ? await platform.owned('products', project.productId, user)
      : product;
  const selected = new Set([...(linked?.adLibraryIds || []), ...(project?.adLibraryIds || [])]);
  const scoped = Boolean(product || project);
  const rows = (
    await platform.store.list('ad_library_observations', { businessId: user.businessId })
  ).filter(
    (row) =>
      !row.archived &&
      (query.country === 'ALL' || [query.country, 'ALL'].includes(row.country)) &&
      (!scoped ||
        selected.has(row.id) ||
        (linked && row.productId === linked.id) ||
        (project && row.projectId === project.id)) &&
      (!query.q ||
        norm(`${row.pageName} ${row.adCopy} ${row.offer} ${row.notes}`).includes(norm(query.q))),
  );
  const ids = new Set(rows.map((row) => row.id));
  const history = (
    await platform.store.list('ad_library_history', { businessId: user.businessId })
  ).filter((row) => ids.has(row.observationId));
  const advertisers = new Map();
  const prices = [];
  for (const row of rows) {
    const key = row.pageId ? `id:${row.pageId}` : `name:${norm(row.pageName)}`;
    const group = advertisers.get(key) || {
      key,
      name: row.pageName,
      pageId: row.pageId || '',
      ads: [],
      prices: [],
    };
    const ageDays = Math.max(0, Math.floor((Date.now() - Date.parse(row.observedAt)) / 86400000));
    const daysObserved = row.startDateObserved
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(row.observedAt) - Date.parse(`${row.startDateObserved}T00:00:00+06:00`)) /
              86400000,
          ),
        )
      : null;
    const ad = {
      id: row.id,
      libraryAdId: row.libraryAdId,
      source: row.adUrl,
      statusObserved: row.statusObserved,
      observedAt: row.observedAt,
      ageDays,
      daysObserved,
      offer: row.offer,
      analysisAvailable: Boolean(row.analysis),
    };
    group.ads.push(ad);
    if (Number.isFinite(row.advertisedPrice) && row.advertisedPrice > 0) {
      const price = {
        observationId: row.id,
        advertiser: row.pageName,
        advertiserKey: key,
        country: row.country,
        source: row.adUrl,
        amount: row.advertisedPrice,
        currency: row.priceCurrency || 'BDT',
        basis: row.priceBasis || 'unknown',
        comparability: row.comparability || 'unknown',
        observedAt: row.observedAt,
        stale: ageDays >= 30,
      };
      prices.push(price);
      group.prices.push(price);
    }
    advertisers.set(key, group);
  }
  const stats = [];
  for (const pair of new Set(
    scoped
      ? prices.filter((p) => p.country !== 'ALL').map((p) => `${p.country}:${p.currency}`)
      : [],
  )) {
    const [country, currency] = pair.split(':');
    const comparable = prices.filter(
      (p) =>
        p.country === country &&
        p.currency === currency &&
        p.basis === 'unit' &&
        p.comparability === 'comparable' &&
        !p.stale,
    );
    // One latest comparable quote per advertiser, rather than overweighting repeated ads.
    const unique = [
      ...new Map(
        comparable
          .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
          .map((p) => [p.advertiserKey, p]),
      ).values(),
    ];
    const values = unique.map((p) => p.amount).sort((a, b) => a - b);
    if (values.length)
      stats.push({
        currency,
        country,
        basis: 'unit',
        samples: values.length,
        min: values[0],
        max: values.at(-1),
        median:
          values.length % 2
            ? values[Math.floor(values.length / 2)]
            : (values[values.length / 2 - 1] + values[values.length / 2]) / 2,
      });
  }
  return {
    country: query.country,
    scope: scoped ? 'linked-and-selected' : 'workspace-sample',
    sampledAds: rows.length,
    advertisers: [...advertisers.values()].sort((a, b) => b.ads.length - a.ads.length),
    activeObserved: rows.filter((r) => r.statusObserved === 'active').length,
    datedAds: rows.filter((r) => r.startDateObserved).length,
    staleAds: rows.filter((r) => Date.now() - Date.parse(r.observedAt) >= 30 * 86400000).length,
    prices,
    comparablePriceRanges: stats,
    priceHistory: history
      .filter((r) => Number.isFinite(r.facts.advertisedPrice))
      .map((r) => ({
        observationId: r.observationId,
        revision: r.revision,
        advertiser: r.facts.pageName,
        source: r.facts.adUrl,
        amount: r.facts.advertisedPrice,
        currency: r.facts.priceCurrency,
        basis: r.facts.priceBasis,
        comparability: r.facts.comparability,
        observedAt: r.facts.observedAt,
        recordedAt: r.recordedAt,
      }))
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt)),
    gaps: [
      ...(rows.length < 3
        ? ['Fewer than three saved ads; broaden the sample before comparing.']
        : []),
      ...(advertisers.size < 3 ? ['Fewer than three distinct advertisers.'] : []),
      ...(!stats.length ? ['No recent, comparable unit prices.'] : []),
      ...(rows.some((r) => !r.startDateObserved) ? ['Some ad start dates are unknown.'] : []),
      ...(rows.some((r) => Date.now() - Date.parse(r.observedAt) >= 30 * 86400000)
        ? ['Some observations are older than 30 days; check their current details.']
        : []),
      'Ad counts and longevity do not establish advertiser spend, sales, profit or market-wide competition.',
    ],
    provenance:
      'Saved observations only; never a census of Meta ads or verified competitor performance.',
  };
}

export function comparableAdPrices(observations, country = 'BD', currency = 'BDT') {
  const rows = observations.filter(
    (row) =>
      row.countryObserved === country &&
      row.priceCurrency === currency &&
      row.priceBasis === 'unit' &&
      row.comparability === 'comparable' &&
      Number.isFinite(row.advertisedPrice) &&
      row.advertisedPrice > 0 &&
      Date.parse(row.observedAt) <= Date.now() &&
      Date.now() - Date.parse(row.observedAt) < 30 * 86400000,
  );
  return [
    ...new Map(
      rows
        .sort((a, b) => a.observedAt.localeCompare(b.observedAt))
        .map((r) => [r.pageId || norm(r.pageName), r.advertisedPrice]),
    ).values(),
  ];
}

export function evidenceDigest(sample) {
  return {
    country: sample.country,
    scope: sample.scope,
    sampledAds: sample.sampledAds,
    advertiserCount: sample.advertisers.length,
    activeObserved: sample.activeObserved,
    staleAds: sample.staleAds,
    datedAds: sample.datedAds,
    comparablePriceRanges: sample.comparablePriceRanges,
    advertisers: sample.advertisers.slice(0, 12).map((row) => ({
      name: row.name,
      pageId: row.pageId,
      sampledAds: row.ads.length,
      prices: row.prices.slice(0, 4),
      examples: row.ads.slice(0, 3),
    })),
    gaps: sample.gaps,
    provenance: sample.provenance,
  };
}

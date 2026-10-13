import { z } from 'zod';
import { countryNames } from './countries.js';
import { adLibrarySearchLink } from './ad-library-links.js';
import { cachedResearch } from './cache.js';
import { workspaceLLM } from '../../integrations/credentials.js';

export const searchStrategyInput = z
  .object({
    keyword: z.string().trim().min(2).max(100),
    country: z.enum(['ALL', ...Object.keys(countryNames)]).default('BD'),
    productId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    extraKeywords: z.array(z.string().trim().min(2).max(80)).max(10).default([]),
    useAI: z.boolean().default(false),
  })
  .strict();
const outputSchema = z
  .object({ keywords: z.array(z.string().trim().min(2).max(80)).min(1).max(12) })
  .strict();
const synonyms = [
  [
    /earbuds|earphones|tws|ইয়ারবাড|ইয়ারবাড/i,
    [
      'wireless earbuds',
      'Bluetooth earphones',
      'TWS earbuds',
      'ব্লুটুথ ইয়ারবাডস',
      'ওয়্যারলেস ইয়ারফোন',
    ],
  ],
  [/headphone|হেডফোন/i, ['wireless headphones', 'Bluetooth headphones', 'ব্লুটুথ হেডফোন']],
  [
    /three.?piece|dupatta|লন|থ্রি.?পিস/i,
    ['three piece', 'lawn three piece', 'থ্রি পিস', 'আনস্টিচ থ্রি পিস'],
  ],
  [/tote|canvas.?bag|টোট/i, ['canvas tote bag', 'cotton tote bag', 'ক্যানভাস ব্যাগ', 'টোট ব্যাগ']],
  [/skin|serum|skincare|সিরাম/i, ['skincare', 'face serum', 'ত্বকের যত্ন', 'ফেস সিরাম']],
  [
    /ecommerce|e-commerce|ই.?কমার্স/i,
    [
      'custom ecommerce',
      'ecommerce website development',
      'online store development',
      'ইকমার্স ওয়েবসাইট',
    ],
  ],
  [
    /software|saas|সফটওয়্যার/i,
    ['custom software development', 'business software', 'সফটওয়্যার ডেভেলপমেন্ট'],
  ],
];
const unique = (items) => [
  ...new Map(
    items
      .filter(Boolean)
      .map((term) => [term.normalize('NFKC').toLowerCase().trim(), term.trim().slice(0, 100)]),
  ).values(),
];
export async function searchStrategy(platform, user, input) {
  input = searchStrategyInput.parse(input);
  const product = input.productId ? await platform.owned('products', input.productId, user) : null;
  const project = input.projectId
    ? await platform.owned('research_projects', input.projectId, user)
    : null;
  const ads = (
    await platform.store.list('ad_library_observations', { businessId: user.businessId })
  ).filter(
    (row) =>
      !row.archived &&
      (input.country === 'ALL' || [input.country, 'ALL'].includes(row.country)) &&
      (product || project
        ? (product && row.productId === product.id) ||
          (project && row.projectId === project.id) ||
          [...(product?.adLibraryIds || []), ...(project?.adLibraryIds || [])].includes(row.id)
        : `${row.adCopy} ${row.offer} ${row.pageName}`
            .toLowerCase()
            .includes(input.keyword.toLowerCase())),
  );
  let keywords = unique([
    input.keyword,
    ...input.extraKeywords,
    ...synonyms
      .filter(([pattern]) =>
        pattern.test(`${input.keyword} ${product?.name || ''} ${project?.name || ''}`),
      )
      .flatMap(([, terms]) => terms),
  ]).slice(0, 16);
  let reuse = null;
  if (input.useAI) {
    const llm = await workspaceLLM(platform, user.businessId);
    const generated = await cachedResearch(
      platform,
      user,
      llm,
      'ad-search-strategy',
      {
        keyword: input.keyword,
        country: input.country,
        description: product?.description || project?.description || '',
        knownTerms: keywords,
        rules:
          'Suggest short relevant synonyms, Bengali variants for Bangladesh, and alternate buyer problem/category search terms for public Meta Ad Library search. Do not invent advertisers or competitor brands, claim searches were run or ads were found, or invent performance. These are unverified search suggestions only. Return at most twelve terms.',
      },
      outputSchema,
    );
    if (generated.output)
      keywords = unique([...keywords, ...generated.output.keywords]).slice(0, 24);
    reuse = generated.reuse;
  }
  const advertisers = [
    ...new Map(ads.map((row) => [row.pageId || row.pageName.toLowerCase(), row])).values(),
  ].slice(0, 12);
  return {
    country: input.country,
    keyword: input.keyword,
    reuse,
    searches: keywords.map((term) => ({
      keyword: term,
      type: 'keyword',
      url: adLibrarySearchLink({ keyword: term, country: input.country }),
    })),
    advertiserSearches: advertisers.map((row) => ({
      keyword: row.pageName,
      pageId: row.pageId || '',
      type: row.pageId ? 'page' : 'advertiser-name',
      url: adLibrarySearchLink({
        keyword: row.pageName,
        pageId: row.pageId,
        country: input.country,
      }),
    })),
    collectionMode: 'public-search-and-save',
    note: 'Search suggestions open public Meta Ad Library. No search result is automatically fetched. Save the actual ads found; a completed search can have zero results.',
  };
}

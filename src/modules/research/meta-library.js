import { z } from 'zod';
import { assert } from '../../utils/core.js';
import { countryNames } from './countries.js';
import { cachedResearch } from './cache.js';
import { canonicalAdLibraryLink, archiveCountries } from './ad-library-links.js';

// Official commercial-ad API coverage; Bangladesh uses the public search-and-save workflow.
export const archiveSearchInput = z
  .object({
    country: z.enum(['ALL', ...Object.keys(countryNames)]),
    keyword: z.string().trim().min(2).max(100),
    pageId: z
      .string()
      .regex(/^(\d{5,30})?$/)
      .default(''),
    fresh: z.boolean().default(false),
  })
  .strict();
const resultSchema = z
  .object({
    items: z.array(
      z.object({
        libraryAdId: z.string().regex(/^\d{5,30}$/),
        pageName: z.string(),
        pageId: z.string(),
        country: z.string(),
        adUrl: z.string(),
        adCopy: z.string(),
        startDateObserved: z.string(),
        observedAt: z.string(),
        statusObserved: z.literal('active'),
      }),
    ),
    hasMore: z.boolean(),
    demo: z.boolean(),
  })
  .strict();
export async function searchMetaLibrary(platform, user, input) {
  input = archiveSearchInput.parse(input);
  assert(
    archiveCountries.includes(input.country),
    422,
    'AD_ARCHIVE_COVERAGE',
    'Official commercial-ad API search supports the UK/EU markets listed here. For Bangladesh use the free public search checklist and save actual ads.',
  );
  const integration = await platform.integration(user.businessId);
  assert(
    platform.config.mode === 'demo' || integration?.encryptedToken,
    409,
    'META_NOT_CONFIGURED',
    'Connect an eligible Meta token in Accounts. Ad Library API access may require separate identity/access approval.',
  );
  const adapter = {
    config: {
      llmProvider: 'meta-library-api',
      llmModel: platform.config.metaVersion,
      llmKey: integration?.encryptedToken,
    },
    async generate() {
      if (platform.config.mode === 'demo') return { items: [], hasMore: false, demo: true };
      const response = await platform.meta.request(integration, 'GET', 'ads_archive', {
        ad_type: 'ALL',
        ad_active_status: 'ACTIVE',
        ad_reached_countries: [input.country],
        limit: 25,
        ...(input.pageId ? { search_page_ids: [input.pageId] } : { search_terms: input.keyword }),
        fields:
          'id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time',
      });
      const observedAt = new Date().toISOString();
      const items = (response.data || [])
        .slice(0, 25)
        .filter((row) => /^\d{5,30}$/.test(row.id || ''))
        .map((row) => ({
          libraryAdId: row.id,
          pageName: String(row.page_name || 'Unknown advertiser').slice(0, 200),
          pageId: /^\d{5,30}$/.test(row.page_id || '') ? row.page_id : '',
          country: input.country,
          adUrl: canonicalAdLibraryLink(row.id),
          adCopy: [...(row.ad_creative_bodies || []), ...(row.ad_creative_link_titles || [])]
            .filter((text) => typeof text === 'string')
            .join('\n')
            .slice(0, 6000),
          startDateObserved: /^\d{4}-\d{2}-\d{2}/.test(row.ad_delivery_start_time || '')
            ? row.ad_delivery_start_time.slice(0, 10)
            : '',
          observedAt,
          statusObserved: 'active',
        }));
      return { items, hasMore: Boolean(response.paging?.next), demo: false };
    },
  };
  try {
    const result = await cachedResearch(
      platform,
      user,
      adapter,
      'meta-library-api',
      { country: input.country, keyword: input.keyword, pageId: input.pageId },
      resultSchema,
      { fresh: input.fresh },
    );
    return {
      ...result.output,
      reuse: result.reuse,
      note: 'Up to 25 matches for this query, not a count of the whole market. Review the source before saving. Missing prices, screenshots and performance remain unknown.',
    };
  } catch (error) {
    if (error.code === 'META_REJECTED')
      error.message =
        'Meta denied Ad Library API access for this token or query. Check Ad Library API eligibility/identity and token permissions. Public Ad Library search and saved research still work.';
    throw error;
  }
}

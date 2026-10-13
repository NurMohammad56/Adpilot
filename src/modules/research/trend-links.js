import { countryNames } from './countries.js';
import { adLibrarySearchLink } from './ad-library-links.js';

export const sectors = [
  'All sectors',
  'Fashion & clothing',
  'Beauty & personal care',
  'Home & kitchen',
  'Electronics & gadgets',
  'Food & beverages',
  'Health & fitness',
  'Baby & children',
  'Accessories',
  'Books & stationery',
  'Other',
];
export function trendLinks(country, keyword = '') {
  if (!Object.hasOwn(countryNames, country)) throw new Error('Unsupported market');
  const q = keyword.trim().slice(0, 100);
  return [
    {
      name: 'Meta Ad Library',
      kind: 'ads',
      url: adLibrarySearchLink({ country, keyword: q }),
      note: 'Observe actual ads and save copy/screenshots in Ad Library. Ad counts do not prove profit.',
    },
    {
      name: 'Google Trends Explore',
      kind: 'search',
      url: `https://trends.google.com/trends/explore?${new URLSearchParams({ geo: country, date: 'today 3-m', ...(q ? { q } : {}) })}`,
      note: 'Compare relative search interest, related queries and seasonality; search interest is not sales.',
    },
    {
      name: 'Google Trending Now',
      kind: 'search',
      url: `https://trends.google.com/trending?${new URLSearchParams({ geo: country })}`,
      note: 'Current search surges include news. Investigate product relevance before shortlisting.',
    },
    {
      name: 'TikTok Creative Center',
      kind: 'creative',
      url: 'https://ads.tiktok.com/creative/creativeCenter/trends',
      note: 'Check available market filters and creative trends; coverage varies by region.',
    },
    {
      name: 'TikTok Top Ads',
      kind: 'creative',
      url: 'https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en',
      note: 'Use regional and industry filters for creative inspiration; results are a selected sample.',
    },
    ...(country === 'BD'
      ? [
          {
            name: 'Daraz Bangladesh',
            kind: 'offers',
            url: `https://www.daraz.com.bd/catalog/?${new URLSearchParams({ q: q || 'home kitchen' })}`,
            note: 'Compare actual listings, specifications, reviews and delivery terms. Listing presence is not verified sales.',
          },
        ]
      : []),
  ];
}

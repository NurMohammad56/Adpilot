import { z } from 'zod';
import { countryNames } from './countries.js';
import { sectors } from './trend-links.js';
export { sectors, trendLinks } from './trend-links.js';
export const discoveryCountry = z.enum(Object.keys(countryNames));

const cache = new Map();
const xmlText = (value) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(amp|lt|gt|quot|apos);/g,
      (_, key) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[key],
    )
    .trim();
export function parseTrendRSS(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .slice(0, 20)
    .map(([, item]) => {
      const get = (tag) =>
        xmlText(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))?.[1] || '');
      return {
        query: get('title').slice(0, 200),
        searchVolumeLabel: get('ht:approx_traffic').slice(0, 50),
        publishedAt: Number.isFinite(Date.parse(get('pubDate')))
          ? new Date(get('pubDate')).toISOString()
          : null,
      };
    })
    .filter((item) => item.query);
}
export async function getTrendSignals(country, fetcher = fetch) {
  discoveryCountry.parse(country);
  const cached = cache.get(country);
  if (fetcher === fetch && cached && Date.now() - Date.parse(cached.checkedAt) < 30 * 60000)
    return { ...cached, cached: true };
  const source = `https://trends.google.com/trending/rss?${new URLSearchParams({ geo: country })}`;
  let result;
  try {
    const response = await fetcher(source, {
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'application/rss+xml, application/xml' },
    });
    if (!response.ok) throw new Error('Unavailable feed');
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 512000) throw new Error('Feed too large');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const xml = Buffer.concat(chunks).toString('utf8');
    const signals = parseTrendRSS(xml);
    if (!signals.length) throw new Error('Empty feed');
    result = {
      country,
      status: 'available',
      source,
      checkedAt: new Date().toISOString(),
      signals,
      kind: 'search-surges',
      note: 'Live Google search queries, not a product sales or advertising ranking. Coverage and volume labels are supplied by Google.',
    };
  } catch {
    result = {
      country,
      status: 'unavailable',
      source,
      checkedAt: new Date().toISOString(),
      signals: [],
      kind: 'search-surges',
      note: 'The live trend feed is unavailable for this market. Use source links and cited web research; no trend measurements are invented.',
    };
  }
  if (fetcher === fetch) {
    cache.set(country, result);
    if (cache.size > 50) cache.delete(cache.keys().next().value);
  }
  return result;
}

export function sampledSectorCoverage(ads) {
  const rules = [
    /dress|fashion|clothing|three.piece|শাড়ি|থ্রি.?পিস|পোশাক/i,
    /beauty|skin|cosmetic|সৌন্দর্য|ত্বক/i,
    /kitchen|home|storage|রান্না|কিচেন/i,
    /gadget|electronic|phone|charger|ইলেকট্রনিক|চার্জার/i,
    /food|beverage|coffee|খাবার|কফি/i,
    /fitness|exercise|health|ব্যায়াম/i,
    /baby|child|বাচ্চা|শিশু/i,
    /bag|accessor|watch|jewel|ব্যাগ|ঘড়ি/i,
    /book|stationery|বই|খাতা/i,
  ];
  const rows = sectors
    .slice(1)
    .map((name) => ({ name, savedAds: 0, observedActive: 0, analyzed: 0 }));
  for (const ad of ads) {
    const text = `${ad.adCopy} ${ad.offer} ${ad.notes}`;
    const index = rules.findIndex((rule) => rule.test(text));
    const row = rows[index < 0 ? rows.length - 1 : index];
    row.savedAds++;
    if (ad.statusObserved === 'active') row.observedActive++;
    if (ad.analysis && !ad.analysisStale) row.analyzed++;
  }
  return rows;
}

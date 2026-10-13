import { canonicalAdLibraryLink } from './ad-library-links.js';

const westernDigits = (text) =>
  text.replace(/[০-৯]/g, (digit) => String(digit.charCodeAt(0) - 0x09e6));
const currency = (value) =>
  /^(BDT|Tk\.?|৳|টাকা)$/i.test(value)
    ? 'BDT'
    : /^(GBP|£)$/i.test(value)
      ? 'GBP'
      : /^(EUR|€)$/i.test(value)
        ? 'EUR'
        : 'USD';
// Owner-copied source text only. No fetching, invented advertiser, currency conversion or profitability inference.
export function parseCopiedAd(value) {
  const text = String(value || '')
    .slice(0, 20000)
    .replace(
      /(?:access_token|appsecret_proof|client_secret)\s*[=:]\s*[^\s&]+/gi,
      '[credential removed]',
    )
    .replace(
      /\b(?:N?EAA[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{25,})\b/g,
      '[credential removed]',
    );
  const normalized = westernDigits(text);
  const urls =
    normalized.match(
      /https:\/\/(?:www\.|m\.|web\.)?facebook\.com\/ads\/(?:library\/?|archive\/render_ad\/?)\?[^\s<>"']+/g,
    ) || [];
  const adUrl =
    urls.map(canonicalAdLibraryLink).find(Boolean) ||
    canonicalAdLibraryLink(
      normalized.match(
        /(?:Library\s*ID|Ad\s*Library\s*ID|লাইব্রেরি\s*আইডি)\s*[:#]?\s*(\d{5,30})/i,
      )?.[1],
    );
  const pageName =
    text
      .match(/^(?:Advertiser|Page name|Business name|বিজ্ঞাপনদাতা|পেজের নাম)\s*:\s*(.+)$/im)?.[1]
      ?.trim()
      .slice(0, 200) || '';
  const pageId =
    normalized.match(/^(?:Page\s*ID|পেজ\s*আইডি)\s*[:#]?\s*(\d{5,30})\s*$/im)?.[1] || '';
  const status =
    normalized.match(/^(?:Status|স্ট্যাটাস)\s*:\s*(active|inactive)\s*$/im)?.[1]?.toLowerCase() ||
    'unknown';
  const date = normalized.match(
    /^(?:Start date|Started running on|শুরুর তারিখ)\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/im,
  )?.[1];
  const startDateObserved =
    date && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
      ? date
      : '';
  const prices = [];
  const parse = (amount, code, line) => {
    amount = amount.replace(/,$/, '');
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(amount)) return;
    const number = Number(amount.replaceAll(',', ''));
    if (number > 0 && number <= 1e8)
      prices.push({
        amount: number,
        currency: currency(code),
        exactVisibleText: line.slice(0, 500),
      });
  };
  for (const line of normalized.split('\n')) {
    if (/\d[\d,.]*\s*[-–]\s*\d/.test(line)) continue;
    for (const match of line.matchAll(
      /(BDT|Tk\.?|৳|টাকা|USD|EUR|GBP|£|€)\s*([\d,]+(?:\.\d{1,2})?)(?![\d,.])/gi,
    ))
      parse(match[2], match[1], line);
    for (const match of line.matchAll(
      /(?<![\d,.])([\d,]+(?:\.\d{1,2})?)\s*(BDT|Tk\.?|৳|টাকা|USD|EUR|GBP|£|€)(?=$|[\s.,!;])/gi,
    ))
      parse(match[1], match[2], line);
  }
  return {
    adUrl,
    pageName,
    pageId,
    statusObserved: status,
    startDateObserved,
    adCopy: text.slice(0, 6000),
    priceCandidates: [
      ...new Map(prices.map((row) => [`${row.currency}:${row.amount}`, row])).values(),
    ].slice(0, 8),
  };
}

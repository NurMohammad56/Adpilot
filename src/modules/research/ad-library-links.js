// Public links only. Never retain access tokens or fetch arbitrary submitted URLs.
export function canonicalAdLibraryLink(value) {
  const text = String(value || '').trim();
  if (/^\d{5,30}$/.test(text)) return `https://www.facebook.com/ads/library/?id=${text}`;
  try {
    const url = new URL(text);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(
        url.hostname,
      ) ||
      ![
        '/ads/library',
        '/ads/library/',
        '/ads/archive/render_ad',
        '/ads/archive/render_ad/',
      ].includes(url.pathname) ||
      url.searchParams.getAll('id').length !== 1
    )
      return null;
    const id = url.searchParams.get('id');
    return /^\d{5,30}$/.test(id || '') ? `https://www.facebook.com/ads/library/?id=${id}` : null;
  } catch {
    return null;
  }
}

export function adLibrarySearchLink({ keyword = '', country = 'BD', pageId = '' } = {}) {
  const url = new URL('https://www.facebook.com/ads/library/');
  url.searchParams.set('active_status', 'active');
  url.searchParams.set('ad_type', 'all');
  url.searchParams.set('country', /^(ALL|[A-Z]{2})$/.test(country) ? country : 'BD');
  url.searchParams.set('media_type', 'all');
  if (/^\d{5,30}$/.test(pageId)) {
    url.searchParams.set('search_type', 'page');
    url.searchParams.set('view_all_page_id', pageId);
  } else {
    url.searchParams.set('search_type', 'keyword_unordered');
    url.searchParams.set('q', String(keyword).trim().slice(0, 100));
  }
  return url.href;
}

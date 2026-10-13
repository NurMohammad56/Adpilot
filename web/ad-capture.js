export function primeAdCapture(data, row, scope = {}) {
  const observedDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(row.observedAt));
  const draft = {
    adUrl: row.adUrl,
    pageName: row.pageName,
    pageId: row.pageId,
    country: row.country,
    productId: scope.productId || null,
    projectId: scope.projectId || null,
    advertisedPrice: null,
    priceCurrency: 'BDT',
    priceBasis: 'unknown',
    comparability: 'unknown',
    observedDate,
    startDateObserved: row.startDateObserved,
    adCopy: row.adCopy,
    offer: '',
    landingUrl: '',
    notes:
      'Imported from the official Meta Ad Library API. Review the original ad and specifications before saving. Price and performance are not inferred.',
    screenshotAssetIds: [],
    statusObserved: 'active',
  };
  sessionStorage.setItem(
    `adpilot-draft:${data.business.id}:${data.user.id}:ad-library:new`,
    JSON.stringify(draft),
  );
}

export function primeAdContext(data, scope, country, keyword) {
  const key = `adpilot-draft:${data.business.id}:${data.user.id}:ad-library:new`;
  let existing = null;
  try {
    existing = JSON.parse(sessionStorage.getItem(key));
  } catch {}
  if (!existing?.adUrl) {
    primeAdCapture(
      data,
      {
        adUrl: '',
        pageName: '',
        pageId: '',
        country,
        observedAt: new Date().toISOString(),
        startDateObserved: '',
        adCopy: '',
      },
      scope,
    );
    const draft = JSON.parse(sessionStorage.getItem(key));
    draft.notes = '';
    draft.statusObserved = 'unknown';
    sessionStorage.setItem(key, JSON.stringify(draft));
  }
  sessionStorage.setItem(`adpilot-ad-library-selection:${data.business.id}:${data.user.id}`, '""');
  sessionStorage.setItem(
    `adpilot-ad-library-search:${data.business.id}:${data.user.id}`,
    JSON.stringify({ keyword, country, pageId: '' }),
  );
  sessionStorage.setItem(
    `adpilot-market-scope:${data.business.id}:${data.user.id}`,
    JSON.stringify(
      scope.projectId
        ? `project:${scope.projectId}`
        : scope.productId
          ? `product:${scope.productId}`
          : '',
    ),
  );
}

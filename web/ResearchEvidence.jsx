import React, { useEffect, useState, useRef } from 'react';
import { ExternalLink, Search, Database, Sparkles } from 'lucide-react';
import { useLanguage, translateText } from './i18n.js';
import { useDraft } from './use-draft.js';
import { Pagination, usePagination } from './Pagination.jsx';
import { archiveCountries } from '../src/modules/research/ad-library-links.js';
import { primeAdCapture, primeAdContext } from './ad-capture.js';
import './research-evidence.css';
const external = { target: '_blank', rel: 'noopener noreferrer', referrerPolicy: 'no-referrer' };
const price = (p) => `${p.currency} ${p.amount.toLocaleString('en-US')}`;

function OfficialAdSearch({ data, api, run, busy, keyword, country, onCapture }) {
  const bn = useLanguage() === 'bn',
    supported = archiveCountries.includes(country);
  const [results, setResults] = useState(null),
    [error, setError] = useState(''),
    [fresh, setFresh] = useState(false);
  const current = useRef('');
  current.current = `${data.business.id}:${keyword}:${country}`;
  useEffect(() => {
    setResults(null);
    setError('');
  }, [data.business.id, keyword, country]);
  async function search() {
    const requested = current.current;
    setError('');
    try {
      const response = await api('/ad-library/api-search', 'POST', { keyword, country, fresh });
      if (current.current === requested) setResults(response);
    } catch (err) {
      if (current.current === requested) setError(err.message);
    }
  }
  return (
    <details className="official-ad-search">
      <summary>
        {bn ? 'Official Meta API search (UK/EU)' : 'Official Meta API search (UK/EU)'}
      </summary>
      <p>
        {bn
          ? 'বাংলাদেশের সাধারণ product ads এই API coverage-এ নেই। বাংলাদেশে উপরের public search ব্যবহার করুন। UK/EU search-এর জন্য eligible token ও Meta-এর পৃথক access লাগতে পারে।'
          : 'Commercial Bangladesh ads are outside this API coverage. Use the public searches above for Bangladesh. UK/EU search may require separate Meta eligibility and an eligible token.'}
      </p>
      <div className="official-ad-search-controls">
        <a {...external} href="https://www.facebook.com/ads/library/api/">
          {bn ? 'Meta API coverage ও access' : 'Meta API coverage and access'}
        </a>
        <label className="check-label">
          <input
            type="checkbox"
            checked={fresh}
            onChange={(e) => setFresh(e.target.checked)}
            disabled={!supported}
          />
          {bn ? 'API-তে আবার check করুন (cache বাদ দিন)' : 'Check the API again (skip cache)'}
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={busy || !supported || keyword.trim().length < 2}
          onClick={() => run(search)}
        >
          {bn ? 'Official API-তে খুঁজুন' : 'Search official API'}
        </button>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {results && (
        <>
          <p>
            {results.demo
              ? bn
                ? 'Demo only; কোনো live search হয়নি।'
                : 'Demo only; no live search was performed.'
              : `${results.items.length} ${bn ? 'query match পাওয়া গেছে' : 'matches for this query'}`}
            {results.hasMore
              ? bn
                ? ' · আরও results আছে; এটি পূর্ণ market count নয়।'
                : ' · More matches exist; this is not the market total.'
              : ''}
          </p>
          {results.reuse?.cached && (
            <p className="small muted">
              {bn
                ? 'Saved API results; current status আবার check করতে cache বাদ দিন।'
                : 'Saved API results; skip cache to check current status again.'}
            </p>
          )}
          <div className="search-checklist">
            {results.items.map((row) => (
              <article className="api-ad-result" key={row.libraryAdId}>
                <strong>{row.pageName}</strong>
                <p>{row.adCopy || (bn ? 'Copy পাওয়া যায়নি।' : 'Ad copy unavailable.')}</p>
                <a {...external} href={row.adUrl}>
                  {bn ? 'আসল ad দেখুন' : 'Open original ad'}
                </a>
                {onCapture && (
                  <button type="button" className="button secondary" onClick={() => onCapture(row)}>
                    {bn ? 'Review করে form-এ নিন' : 'Review in capture form'}
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </details>
  );
}

export function ResearchReuseNote({ report }) {
  const bn = useLanguage() === 'bn',
    reuse = report?.researchReuse;
  if (!reuse) return null;
  return (
    <p className="research-reuse-note">
      <Database size={16} />
      {bn
        ? reuse.cached
          ? 'আগের research reuse হয়েছে—এই analysis-এর জন্য নতুন AI call হয়নি।'
          : 'এই analysis সংরক্ষিত আছে। একই input ও evidence দিয়ে ১২ ঘণ্টার মধ্যে আবার করলে reuse হবে।'
        : reuse.cached
          ? 'Saved research reused; no new AI call for this analysis.'
          : 'Analysis saved. Matching inputs and evidence can reuse it for up to 12 hours.'}{' '}
      <span>
        {new Date(reuse.generatedAt).toLocaleString(bn ? 'bn-BD' : 'en-GB', {
          timeZone: 'Asia/Dhaka',
        })}
      </span>
    </p>
  );
}
export function MarketSample({ sample }) {
  const bn = useLanguage() === 'bn';
  const rows = sample?.advertisers || [];
  const pager = usePagination(rows, {
    pageSize: 6,
    resetKey: `${sample?.country}:${sample?.scope}`,
  });
  if (!sample) return null;
  return (
    <section className="market-sample">
      <h3>{bn ? 'সংরক্ষিত competitor evidence' : 'Saved competitor evidence'}</h3>
      <div className="evidence-metrics">
        <div>
          <strong>{sample.sampledAds}</strong>
          <span>{bn ? 'সংরক্ষিত ad' : 'Saved ads'}</span>
        </div>
        <div>
          <strong>{sample.advertiserCount ?? rows.length}</strong>
          <span>{bn ? 'Advertiser-এর sample' : 'Sampled advertisers'}</span>
        </div>
        <div>
          <strong>{sample.activeObserved}</strong>
          <span>{bn ? 'দেখার দিনে active ছিল' : 'Observed as active'}</span>
        </div>
        <div>
          <strong>{sample.staleAds}</strong>
          <span>{bn ? '৩০ দিনের পুরোনো' : 'Over 30 days old'}</span>
        </div>
      </div>
      <p className="small muted">
        {bn
          ? 'এটি আপনার saved sample; পুরো Facebook market-এর সংখ্যা বা competitor-এর sales/profit নয়।'
          : 'Your saved sample, not total Facebook competition or competitor sales/profit.'}
      </p>
      {!!sample.gaps?.length && (
        <details className="evidence-gaps">
          <summary>{bn ? 'এই evidence-এ কী বাকি আছে' : 'What this evidence still needs'}</summary>
          <ul>
            {sample.gaps.map((gap, i) => (
              <li key={i}>{translateText(gap)}</li>
            ))}
          </ul>
        </details>
      )}
      {sample.comparablePriceRanges?.map((p) => (
        <p className="price-range" key={`${p.country}:${p.currency}:${p.basis}`}>
          {p.country} · {bn ? 'Comparable দাম' : 'Comparable price'} ({p.basis}):{' '}
          <strong>
            {p.currency} {p.min.toLocaleString()}–{p.max.toLocaleString()}
          </strong>{' '}
          · {bn ? 'মধ্যমান' : 'Median'} {p.median.toLocaleString()} · {p.samples}{' '}
          {bn ? 'advertiser' : 'advertisers'}
        </p>
      ))}
      {!!rows.length && (
        <details>
          <summary>
            {bn ? 'Advertiser, offer ও তারিখ দেখুন' : 'View advertisers, offers and dates'}
          </summary>
          <div className="advertiser-grid">
            {pager.items.map((row) => (
              <article key={row.key || `${row.pageId}:${row.name}`}>
                <strong>{row.name}</strong>
                <span>
                  {row.ads?.length ?? row.sampledAds} {bn ? 'saved ad' : 'saved ads'}
                </span>
                {row.prices?.slice(0, 3).map((p, i) => (
                  <small key={i}>
                    {price(p)} · {p.basis} · {p.comparability}
                    {p.stale ? ' · older observation' : ''}
                  </small>
                ))}
                {(row.ads || row.examples || []).slice(0, 3).map((ad) => (
                  <a {...external} href={ad.source} key={ad.id}>
                    {ad.offer || ad.libraryAdId || 'Ad details'}
                    <small>
                      {new Date(ad.observedAt).toLocaleDateString()}{' '}
                      {Number.isFinite(ad.daysObserved)
                        ? ` · ${ad.daysObserved} ${bn ? 'দিন, দেখার তারিখ পর্যন্ত' : 'days as of observation'}`
                        : ''}
                    </small>
                  </a>
                ))}
              </article>
            ))}
          </div>
          <Pagination pagination={pager} label="Advertiser samples" sizes={[6, 12, 24]} />
        </details>
      )}
      {!!sample.priceHistory?.length && (
        <details>
          <summary>{bn ? 'Price history দেখুন' : 'View price history'}</summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{bn ? 'Advertiser' : 'Advertiser'}</th>
                  <th>{bn ? 'দাম' : 'Price'}</th>
                  <th>{bn ? 'দেখার তারিখ' : 'Observed date'}</th>
                  <th>{bn ? 'Version' : 'Revision'}</th>
                </tr>
              </thead>
              <tbody>
                {sample.priceHistory
                  .slice(-30)
                  .reverse()
                  .map((p, i) => (
                    <tr key={`${p.observationId}:${p.revision}:${i}`}>
                      <td>
                        <a {...external} href={p.source}>
                          {p.advertiser}
                        </a>
                      </td>
                      <td>
                        {price(p)} · {p.basis}
                      </td>
                      <td>{new Date(p.observedAt).toLocaleDateString()}</td>
                      <td>{p.revision}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">
            {bn
              ? 'শেষ ৩০টি recorded quote; সময়ের সঙ্গে offer বদলাতে পারে।'
              : 'Latest 30 recorded quotes; offer specifications may change.'}
          </p>
        </details>
      )}
      <p className="small muted">
        {bn
          ? 'Comparable price-এর জন্য একই specification-এর unit price চিহ্নিত করুন; অজানা দাম বা bundle-এর দাম একসঙ্গে তুলনা হয় না।'
          : 'Compare matching specifications only. Unit, project and subscription prices stay separate; bundles and unknown quotes are excluded from the ranges.'}
      </p>
    </section>
  );
}

export function ResearchEvidenceWorkbench({
  data,
  api,
  run,
  busy,
  keyword = '',
  country = 'BD',
  productId,
  projectId,
  onOpenLibrary,
  refreshKey = '',
  allowScopeSelection = false,
  onCapture,
}) {
  const bn = useLanguage() === 'bn';
  const [sample, setSample] = useState(null),
    [strategy, setStrategy] = useState(null),
    [error, setError] = useState('');
  const [extra, setExtra] = useState('');
  const [target, setTarget] = useDraft(
    `adpilot-market-scope:${data.business.id}:${data.user.id}`,
    '',
  );
  const chosen = allowScopeSelection && target ? target.split(':') : null;
  const scope = chosen
    ? { [chosen[0] === 'product' ? 'productId' : 'projectId']: chosen[1] }
    : { ...(productId ? { productId } : {}), ...(projectId ? { projectId } : {}) };
  const [checked, setChecked] = useDraft(
    `adpilot-search-checklist:${data.business.id}:${data.user.id}:${country}:${scope.productId || scope.projectId || keyword}`,
    {},
  );
  const scopeKey = `${data.business.id}:${country}:${scope.productId}:${scope.projectId}:${keyword}:${refreshKey}`;
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  useEffect(() => {
    let live = true;
    setStrategy(null);
    setSample(null);
    setError('');
    api(`/ad-library/market?${new URLSearchParams({ country, ...scope })}`)
      .then((value) => {
        if (live) setSample(value);
      })
      .catch((err) => {
        if (live) setError(err.message);
      });
    return () => {
      live = false;
    };
  }, [scopeKey]);
  async function build(useAI = false) {
    const requested = currentScope.current;
    const value = await api('/ad-library/search-strategy', 'POST', {
      keyword: keyword.trim(),
      country,
      ...scope,
      useAI,
      extraKeywords: extra
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10),
    });
    if (currentScope.current === requested) setStrategy(value);
  }
  const searches = [...(strategy?.searches || []), ...(strategy?.advertiserSearches || [])];
  return (
    <article className="panel tools-panel research-evidence-workbench">
      <div className="evidence-heading">
        <div>
          <h2>{bn ? 'Ad Library research সহকারী' : 'Ad Library research assistant'}</h2>
          <p>
            {bn
              ? 'Keyword → আসল ad সংরক্ষণ → AI analysis → সিদ্ধান্ত। কোনো ফলাফল না পেলে সেটিও research-এর অংশ।'
              : 'Keywords → save actual ads → AI analysis → decision. A search with no results is also a useful observation.'}
          </p>
        </div>
        {onOpenLibrary && (
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              primeAdContext(data, scope, country, keyword);
              onOpenLibrary();
            }}
          >
            {bn ? 'Ad সংরক্ষণ করুন' : 'Save competitor ads'}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {allowScopeSelection && (
        <label className="extra-search-terms">
          {bn ? 'Evidence scope বেছে নিন' : 'Choose evidence scope'}
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">
              {bn
                ? 'Selected ad-এর context / general sample'
                : 'Selected ad context / general sample'}
            </option>
            {data.products.map((row) => (
              <option key={row.id} value={`product:${row.id}`}>
                {row.name} · Product
              </option>
            ))}
            {data.researchProjects.map((row) => (
              <option key={row.id} value={`project:${row.id}`}>
                {row.name} · Research
              </option>
            ))}
          </select>
        </label>
      )}
      <MarketSample sample={sample} />
      <label className="extra-search-terms">
        {bn
          ? 'অতিরিক্ত keyword (কমা দিয়ে লিখুন, ঐচ্ছিক)'
          : 'Extra search terms (comma-separated, optional)'}
        <input
          maxLength={800}
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder={
            bn ? 'বাংলা নাম, অন্য নাম, buyer problem' : 'Bangla names, synonyms, buyer problems'
          }
        />
      </label>
      <div className="evidence-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy || keyword.trim().length < 2}
          onClick={() => run(() => build(false))}
        >
          <Search size={16} />
          {bn ? 'Search checklist তৈরি' : 'Build search checklist'}
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={busy || keyword.trim().length < 2}
          onClick={() => run(() => build(true))}
        >
          <Sparkles size={16} />
          {bn ? 'AI দিয়ে keyword বাড়ান' : 'Expand keywords with AI'}
        </button>
      </div>
      <p className="small muted">
        {bn
          ? 'Checklist তৈরি করতে AI token লাগে না। AI expansion একই input-এ cache reuse করে। Link খুলে Meta-তে search করুন; results এখানে automatic import হয় না।'
          : 'Checklist generation uses no AI tokens. AI expansion reuses matching cached inputs. Open links to search Meta; results are not automatically imported.'}
      </p>
      {!!searches.length && (
        <>
          <div className="search-checklist">
            {searches.map((item, i) => (
              <div key={`${item.type}:${item.keyword}:${i}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={Boolean(checked[item.url])}
                    onChange={(e) =>
                      setChecked((previous) => ({ ...previous, [item.url]: e.target.checked }))
                    }
                  />
                  {bn ? 'দেখেছি' : 'Reviewed'}
                </label>
                <a {...external} href={item.url}>
                  {item.keyword}
                  <ExternalLink size={14} />
                </a>
                <small>
                  {item.type === 'keyword'
                    ? bn
                      ? 'Keyword suggestion'
                      : 'Keyword suggestion'
                    : bn
                      ? 'আপনার saved advertiser'
                      : 'Your saved advertiser'}
                </small>
              </div>
            ))}
          </div>
          <p className="small muted">
            {bn
              ? 'Reviewed মানে আপনি search করেছেন; ad পাওয়া গেছে বা verified হয়েছে—এমন দাবি নয়।'
              : 'Reviewed means you checked the search; it does not mean ads were found or verified.'}
          </p>
          {strategy?.reuse?.cached && (
            <p className="research-reuse-note">
              {bn ? 'Saved keyword plan reuse হয়েছে।' : 'Saved keyword plan reused.'}
            </p>
          )}
        </>
      )}
      <OfficialAdSearch
        data={data}
        api={api}
        run={run}
        busy={busy}
        keyword={keyword}
        country={country}
        onCapture={
          onCapture
            ? (row) => onCapture(row, scope)
            : onOpenLibrary
              ? (row) => {
                  primeAdCapture(data, row, scope);
                  onOpenLibrary();
                }
              : null
        }
      />
    </article>
  );
}

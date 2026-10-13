import React, { useEffect, useState } from 'react';
import {
  Search,
  ArrowRight,
  Bookmark,
  ExternalLink,
  RefreshCw,
  Compass,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useLanguage } from './i18n.js';
import { useDraft } from './use-draft.js';
import { AdLibraryPicker } from './AdLibraryPicker.jsx';
import { useReportTranslation, ReportTranslationNotice } from './ReportTranslation.jsx';
import { ResearchRetrieval } from './AIConnection.jsx';
import { sectors, trendLinks } from '../src/modules/research/trend-links.js';
import { countryNames } from '../src/modules/research/countries.js';
import { calculateEconomics } from '../src/modules/pricing/engine.js';

const external = { target: '_blank', rel: 'noopener noreferrer' };
export function TrendSourceHub({ country = 'BD', keyword = '' }) {
  const bn = useLanguage() === 'bn';
  return (
    <section className="trend-source-hub">
      <h3>{bn ? 'Trend ও competitor যাচাই করুন' : 'Trend & competitor sources'}</h3>
      <p>
        {bn
          ? 'Keyword ও country অনুযায়ী source খুলুন। যা দেখেছেন তার link, তথ্য ও তারিখ নিচে রাখুন; Ad Library-তে ad-এর লেখা ও screenshot সংরক্ষণ করুন।'
          : 'Open sources for your keyword and market. Save the actual observation, URL and date below; save ad copy and screenshots in Ad Library.'}
      </p>
      <div className="trend-source-links">
        {trendLinks(country, keyword).map((link) => (
          <a className="trend-source-link" key={link.name} href={link.url} {...external}>
            <span>
              <strong>{link.name}</strong>
              <small>{link.note}</small>
            </span>
            <ExternalLink size={16} />
          </a>
        ))}
      </div>
    </section>
  );
}
export function SampleCoverage({ rows = [], total = 0 }) {
  const bn = useLanguage() === 'bn',
    max = Math.max(1, ...rows.map((row) => row.savedAds));
  return (
    <section className="panel discovery-coverage">
      <div className="panel-heading">
        <div>
          <h2>{bn ? 'Sector অনুযায়ী saved ad coverage' : 'Saved ad coverage by sector'}</h2>
          <p>
            {bn
              ? `${total}টি saved ad-এর sample; এটি পুরো Meta market-এর ranking নয়। Category keyword থেকে অনুমান করা; active status সংরক্ষণের দিনের।`
              : `${total} saved observations; a sample, not a Meta-wide promotion ranking. Categories inferred from keywords; active status is historical.`}
          </p>
        </div>
      </div>
      <div className="coverage-bars">
        {rows.map((row) => (
          <div className="coverage-row" key={row.name}>
            <span>{row.name}</span>
            <div className="coverage-track">
              <span style={{ width: `${(100 * row.savedAds) / max}%` }} />
            </div>
            <strong>{row.savedAds}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
function OpportunityCalculator({ candidateId, country }) {
  const bn = useLanguage() === 'bn';
  const [cost, setCost] = useDraft(`adpilot-discovery-cost:${candidateId}`, {
    price: '',
    unit: '',
    packaging: '',
    delivery: '80',
    customerFee: '0',
    failed: '10',
    returnShipping: '0',
    reserve: '30',
  });
  const ready =
    ['price', 'unit', 'packaging'].every(
      (key) => cost[key] !== '' && Number.isFinite(Number(cost[key])),
    ) && Number(cost.price) > 0;
  const result = ready
    ? calculateEconomics({
        inventory: 0,
        sellingPrice: Number(cost.price),
        minProfit: 0,
        desiredMargin: 0,
        paymentMethod: 'cod',
        costs: {
          product: Number(cost.unit),
          packaging: Number(cost.packaging),
          delivery: Number(cost.delivery),
          paymentFixed: 0,
          paymentPercent: 0,
          other: 0,
          returnRate: Number(cost.failed) / 100,
          returnCost: 0,
        },
        costPlanning: {
          mode: 'automatic',
          courierCharge: Number(cost.delivery),
          customerDeliveryCharge: Number(cost.customerFee),
          returnShippingCost: Number(cost.returnShipping),
          returnRateSource: 'measured',
          profitReserveRatio: Number(cost.reserve) / 100,
        },
      })
    : null;
  return (
    <section className="opportunity-calculator">
      <h3>
        {bn
          ? 'আপনার actual cost দিয়ে সম্ভাবনা দেখুন'
          : 'Check the opportunity with your actual costs'}
      </h3>
      <p>
        {bn
          ? 'এই হিসাব forecast নয়। Actual supplier cost বসান। Failed-order rate ও profit reserve আপনি বদলাতে পারবেন; default কোনো measured benchmark নয়। Tax, payment fee ও অন্য খরচ product profile-এ সম্পূর্ণ করুন।'
          : 'This is a scenario, not a forecast. Enter supplier costs. Failed-order rate and profit reserve are editable assumptions, not measured benchmarks. Complete taxes, fees and other costs in the product profile.'}
      </p>
      <div className="discovery-cost-grid">
        {[
          ['price', bn ? 'বিক্রয়মূল্য' : 'Selling price'],
          ['unit', bn ? 'ইউনিট ক্রয়মূল্য' : 'Unit purchase cost'],
          ['packaging', bn ? 'প্যাকেজিং' : 'Packaging'],
          ['customerFee', bn ? 'Buyer-এর delivery fee' : 'Delivery paid by customer'],
          ['returnShipping', bn ? 'ফেরত shipping cost' : 'Return shipping cost'],
          ['failed', bn ? 'Failed orders % (assumption)' : 'Failed orders % (assumption)'],
          ['reserve', bn ? 'Profit reserve % (assumption)' : 'Profit reserve % (assumption)'],
        ].map(([key, label]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              type="number"
              min="0"
              max={key === 'failed' ? 80 : key === 'reserve' ? 100 : 10000000}
              step="any"
              value={cost[key]}
              onChange={(e) => {
                const value = e.target.value;
                if (
                  Number(value) >= 0 &&
                  (key !== 'failed' || Number(value) <= 80) &&
                  (key !== 'reserve' || Number(value) <= 100)
                )
                  setCost({ ...cost, [key]: value });
              }}
            />
          </label>
        ))}
        <label className="field">
          <span>{bn ? 'Courier charge' : 'Courier charge'}</span>
          {country === 'BD' ? (
            <select
              aria-label="Courier charge"
              value={cost.delivery}
              onChange={(e) => setCost({ ...cost, delivery: e.target.value })}
            >
              <option value="80">Inside Dhaka — BDT 80</option>
              <option value="120">Outside Dhaka — BDT 120</option>
            </select>
          ) : (
            <input
              type="number"
              min="0"
              value={cost.delivery}
              onChange={(e) =>
                setCost({ ...cost, delivery: String(Math.max(0, Number(e.target.value))) })
              }
            />
          )}
        </label>
      </div>
      <div className="discovery-economics">
        {[
          ['Expected cost / delivered order', result?.baseVariableCost],
          ['Break-even ad cost / delivered sale', result?.breakEvenCPA],
          ['Maximum ad allowance after reserve', result?.targetCPA],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value == null ? '—' : value.toFixed(2)}</strong>
          </div>
        ))}
      </div>
      <small>
        {country === 'BD' ? 'Amounts in BDT.' : 'Amounts in your entered currency; no conversion.'}{' '}
        {bn
          ? 'কত lead বা sale আসবে তা এই হিসাব বলে না।'
          : 'These calculations do not predict leads or sales.'}
      </small>
    </section>
  );
}
export function ProductDiscovery({ data, api, run, busy, setPage, showProduct }) {
  const bn = useLanguage() === 'bn';
  const [input, setInput] = useDraft(`adpilot-discovery:${data.business.id}:${data.user.id}`, {
    country: 'BD',
    sector: 'All sectors',
    keywords: '',
    goal: 'Find practical products to validate with a small advertising budget.',
    adLibraryIds: [],
    observations: [],
  });
  const [library, setLibrary] = useState({ reports: [], jobs: [], sectorCoverage: [] });
  const [selected, setSelected] = useState(null),
    [error, setError] = useState(''),
    [trends, setTrends] = useState(null),
    [shortlistOnly, setShortlistOnly] = useState(false);
  const [observation, setObservation] = useState({
    source: '',
    finding: '',
    observedAt: new Date().toISOString().slice(0, 10),
  });
  const translation = useReportTranslation(
    'discovery',
    selected?.id,
    selected?.report,
    data.business.id,
  );
  const report = translation.report;
  const load = async () => {
    const next = await api(`/discovery?country=${input.country}`);
    setLibrary(next);
    return next;
  };
  async function openReport(id) {
    setSelected(await api(`/discovery/${id}`));
    sessionStorage.setItem(`adpilot-discovery-selection:${data.business.id}:${data.user.id}`, id);
    setShortlistOnly(false);
  }
  useEffect(() => {
    let cancelled = false;
    api(`/discovery?country=${input.country}`)
      .then(async (next) => {
        if (cancelled) return;
        setLibrary(next);
        const saved = sessionStorage.getItem(
          `adpilot-discovery-selection:${data.business.id}:${data.user.id}`,
        );
        if (!selected && next.reports.some((row) => row.id === saved)) {
          const report = await api(`/discovery/${saved}`);
          if (!cancelled) setSelected(report);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [data.business.id, input.country]);
  const pending = library.jobs.some((job) => ['queued', 'running'].includes(job.status));
  useEffect(() => {
    if (!pending) return;
    let stopped = false,
      timer;
    const poll = async () => {
      try {
        const next = await api(`/discovery?country=${input.country}`);
        if (stopped) return;
        setLibrary(next);
        const completed = next.jobs.find(
          (job) =>
            job.status === 'completed' &&
            library.jobs.some(
              (old) => old.id === job.id && ['queued', 'running'].includes(old.status),
            ),
        );
        if (completed?.reportId) await openReport(completed.reportId);
      } catch (e) {
        if (!stopped) setError(e.message);
      } finally {
        if (!stopped) timer = setTimeout(poll, 4000);
      }
    };
    timer = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [pending, data.business.id, input.country]);
  async function research() {
    setError('');
    const result = await api('/discovery', 'POST', input);
    await load();
    if (result.report) {
      setSelected(result.report);
      sessionStorage.setItem(
        `adpilot-discovery-selection:${data.business.id}:${data.user.id}`,
        result.report.id,
      );
    }
  }
  const candidates =
    report?.candidates.filter(
      (item) => !shortlistOnly || selected.shortlistedIds.includes(item.id),
    ) || [];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">Research / Product discovery</div>
          <h1>{bn ? 'পরবর্তী product খুঁজুন' : 'Discover your next product'}</h1>
          <p>
            {bn
              ? 'Trend, competitor ও ad evidence থেকে idea → shortlist → যাচাই → product → campaign।'
              : 'From trend and competitor evidence to shortlist, validation, product and campaign.'}
          </p>
        </div>
        <button className="button secondary" onClick={() => setPage('Ad Library research')}>
          <Search size={17} />
          {bn ? 'Ad Library যাচাই' : 'Ad Library research'}
        </button>
      </div>
      <div className="discovery-metrics">
        {[
          [Compass, 'Saved research reports', library.reports.length],
          [Bookmark, 'Shortlisted in this report', selected?.shortlistedIds.length || 0],
          [Search, 'Saved ads in this market', library.sampleSize || 0],
          [
            ShieldCheck,
            'Candidate source references',
            report?.candidates.reduce((sum, candidate) => sum + candidate.sourceCount, 0) || 0,
          ],
        ].map(([Icon, label, value]) => (
          <article className="stat-card" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={20} />
            </div>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="discovery-layout">
        <aside className="discovery-sidebar">
          <section className="panel discovery-form">
            <h2>{bn ? 'কী খুঁজবেন?' : 'What should we investigate?'}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(research);
              }}
            >
              <label className="field">
                <span>{bn ? 'Target market' : 'Target market'}</span>
                <select
                  value={input.country}
                  onChange={(e) => {
                    setTrends(null);
                    setInput({ ...input, country: e.target.value });
                  }}
                >
                  {Object.entries(countryNames).map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Sector</span>
                <select
                  value={input.sector}
                  onChange={(e) => setInput({ ...input, sector: e.target.value })}
                >
                  {sectors.map((sector) => (
                    <option key={sector}>{sector}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{bn ? 'Keyword (ঐচ্ছিক)' : 'Product keyword (optional)'}</span>
                <input
                  maxLength={300}
                  value={input.keywords}
                  onChange={(e) => setInput({ ...input, keywords: e.target.value })}
                  placeholder="e.g. home storage, modest fashion"
                />
              </label>
              <label className="field">
                <span>{bn ? 'Goal ও সীমাবদ্ধতা' : 'Goal & constraints'}</span>
                <textarea
                  maxLength={1000}
                  value={input.goal}
                  onChange={(e) => setInput({ ...input, goal: e.target.value })}
                />
              </label>
              <button className="button primary full" disabled={busy || pending}>
                <TrendingUp size={18} />
                {pending
                  ? bn
                    ? 'Research চলছে…'
                    : 'Research in progress…'
                  : bn
                    ? 'Product ideas research করুন'
                    : 'Research product ideas'}
              </button>
              <small>
                {bn
                  ? 'Saved research model ও high thinking ব্যবহার হবে। একই input-এর report ১২ ঘণ্টা reuse হয়; নতুন AI research-এ provider charge হতে পারে।'
                  : 'Uses your saved research model and thinking setting. Identical reports are reused for 12 hours; new AI research may incur provider charges.'}
              </small>
            </form>
          </section>
          <section className="panel discovery-form">
            <TrendSourceHub country={input.country} keyword={input.keywords} />
            <button
              className="button secondary full"
              disabled={busy}
              onClick={() =>
                run(async () =>
                  setTrends(
                    await api(
                      `/discovery/trends?country=${input.country}&keyword=${encodeURIComponent(input.keywords)}`,
                    ),
                  ),
                )
              }
            >
              <RefreshCw size={16} />
              {bn ? 'Live Google search signals' : 'Load live Google search signals'}
            </button>
            {trends && (
              <div className="trend-feed">
                <p>{trends.note}</p>
                {trends.checkedAt && <small>{new Date(trends.checkedAt).toLocaleString()}</small>}
                <ul>
                  {trends.signals.map((item) => (
                    <li key={item.query}>
                      <strong>{item.query}</strong> ·{' '}
                      {item.searchVolumeLabel || 'Volume unavailable'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </aside>
        <div className="discovery-results">
          {error && (
            <p role="alert" className="notice danger">
              {error}
            </p>
          )}
          {library.jobs
            .filter((job) => job.status === 'failed')
            .slice(0, 1)
            .map((job) => (
              <p key={job.id} role="alert" className="notice danger">
                {job.errorMessage || 'Research did not complete. Retry with your saved inputs.'}
              </p>
            ))}
          <section className="panel discovery-evidence">
            <details>
              <summary>
                {bn
                  ? 'Saved ads ও source observations যোগ করুন'
                  : 'Add saved ads & source observations'}
              </summary>
              <AdLibraryPicker
                businessId={data.business.id}
                selected={input.adLibraryIds}
                onChange={(adLibraryIds) => setInput({ ...input, adLibraryIds })}
                onOpenLibrary={() => setPage('Ad Library research')}
                busy={busy}
              />
              <h3>{bn ? 'Source-এ যা দেখেছেন' : 'What did the source actually show?'}</h3>
              <p>
                {bn
                  ? 'একটি link একা প্রমাণ নয়। Exact তথ্য, market ও সময় লিখুন।'
                  : 'A link alone is not evidence. Record the actual observation, market and date.'}
              </p>
              <div className="discovery-observation">
                <label className="field">
                  <span>Source URL</span>
                  <input
                    type="url"
                    value={observation.source}
                    onChange={(e) => setObservation({ ...observation, source: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Observation date</span>
                  <input
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={observation.observedAt}
                    onChange={(e) => setObservation({ ...observation, observedAt: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span>Actual observation</span>
                  <textarea
                    maxLength={2000}
                    value={observation.finding}
                    onChange={(e) => setObservation({ ...observation, finding: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={
                    input.observations.length >= 12 ||
                    !observation.source.startsWith('https://') ||
                    observation.finding.trim().length < 10 ||
                    !observation.observedAt
                  }
                  onClick={() => {
                    setInput({
                      ...input,
                      observations: [
                        ...input.observations,
                        {
                          ...observation,
                          observedAt: new Date(observation.observedAt + 'T00:00:00Z').toISOString(),
                        },
                      ],
                    });
                    setObservation({ ...observation, source: '', finding: '' });
                  }}
                >
                  Add observation
                </button>
              </div>
              {input.observations.map((item, i) => (
                <div className="saved-source-observation" key={i}>
                  <a href={item.source} {...external}>
                    {item.finding}
                  </a>
                  <button
                    className="text-button"
                    onClick={() =>
                      setInput({
                        ...input,
                        observations: input.observations.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
            </details>
          </section>
          <SampleCoverage rows={library.sectorCoverage} total={library.sampleSize} />
          <section className="panel discovery-history">
            <label className="field">
              <span>{bn ? 'Saved report history' : 'Saved report history'}</span>
              <select
                value={selected?.id || ''}
                onChange={(e) => e.target.value && run(() => openReport(e.target.value))}
              >
                <option value="">Choose a saved research report</option>
                {library.reports.map((row) => (
                  <option key={row.id} value={row.id}>
                    {new Date(row.createdAt).toLocaleDateString()} · {row.input.country} ·{' '}
                    {row.input.sector} · {row.candidateCount} ideas
                  </option>
                ))}
              </select>
            </label>
          </section>
          {!selected && (
            <section className="panel discovery-empty">
              <Compass size={40} />
              <h2>{bn ? 'Product যোগ করার আগেই research' : 'Research before adding inventory'}</h2>
              <p>
                {bn
                  ? 'Market ও sector বেছে research করুন। ফলাফলে actual source, competitor, ঝুঁকি ও যাচাইয়ের পরবর্তী ধাপ পাবেন।'
                  : 'Choose your market and sector, then run research. Review source-backed ideas, comparable offers, risks and next validation steps.'}
              </p>
            </section>
          )}
          {selected && (
            <>
              <ReportTranslationNotice translation={translation} />
              <section className="panel discovery-summary">
                <div className="tools-row">
                  <h2>{bn ? 'আপনার product opportunities' : 'Your product opportunities'}</h2>
                  <span className="badge">
                    {selected.demo ? 'Demo' : `${selected.model} · ${selected.thinking}`}
                  </span>
                </div>
                <p>{report.summary}</p>
                <p className="small muted">
                  Market: {selected.input.country} · {new Date(selected.createdAt).toLocaleString()}{' '}
                  ·{' '}
                  {bn
                    ? 'Source-backed idea-ও confirmed profit নয়।'
                    : 'Even source-backed ideas need buyer and profitability validation.'}
                </p>
                <ResearchRetrieval retrieval={report.retrieval} />
                {report.evidenceGaps.length > 0 && (
                  <details>
                    <summary>Evidence still needed</summary>
                    <ul>
                      {report.evidenceGaps.map((gap, i) => (
                        <li key={i}>{gap}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <div className="guide-toolbar">
                  <button
                    className={`button ${shortlistOnly ? 'secondary' : 'primary'}`}
                    onClick={() => setShortlistOnly(false)}
                  >
                    All ideas
                  </button>
                  <button
                    className={`button ${shortlistOnly ? 'primary' : 'secondary'}`}
                    onClick={() => setShortlistOnly(true)}
                  >
                    Shortlist ({selected.shortlistedIds.length})
                  </button>
                </div>
              </section>
              <div className="opportunity-grid">
                {candidates.map((candidate) => {
                  const original = selected.report.candidates.find(
                    (item) => item.id === candidate.id,
                  );
                  const shortlisted = selected.shortlistedIds.includes(candidate.id);
                  return (
                    <article className="panel opportunity-card" key={candidate.id}>
                      <div className="opportunity-heading">
                        <span className="badge">{candidate.category}</span>
                        <button
                          aria-label={`${shortlisted ? 'Remove from' : 'Add to'} shortlist: ${candidate.name}`}
                          aria-pressed={shortlisted}
                          className={`icon-button ${shortlisted ? 'shortlisted' : ''}`}
                          disabled={busy}
                          onClick={() =>
                            run(async () =>
                              setSelected(
                                await api(`/discovery/${selected.id}/shortlist`, 'POST', {
                                  candidateId: candidate.id,
                                  selected: !shortlisted,
                                }),
                              ),
                            )
                          }
                        >
                          <Bookmark size={21} />
                        </button>
                      </div>
                      <h2>{candidate.name}</h2>
                      <div className="opportunity-proof">
                        <span>{candidate.sourceCount} source references</span>
                        <span>{selected.demo ? 'Demo idea' : 'Needs buyer validation'}</span>
                      </div>
                      <p>{candidate.reason}</p>
                      <h3>Buyer & problem</h3>
                      <p>{candidate.buyerProfile}</p>
                      <p>{candidate.problem}</p>
                      <details>
                        <summary>Sources, competitors & risks</summary>
                        <h3>Trend observations</h3>
                        {candidate.trendEvidence.length ? (
                          candidate.trendEvidence.map((item, i) => (
                            <p key={i}>
                              {item.finding}
                              <br />
                              <a href={item.source} {...external}>
                                Original source <ExternalLink size={13} />
                              </a>{' '}
                              · {item.dataDate || 'Undated'}
                            </p>
                          ))
                        ) : (
                          <p>No inspected trend evidence for this product.</p>
                        )}
                        <h3>Comparable offers</h3>
                        {candidate.competitors.length ? (
                          candidate.competitors.map((item, i) => (
                            <div className="opportunity-competitor" key={i}>
                              <a href={item.source} {...external}>
                                <strong>{item.name}</strong>
                              </a>
                              <p>{item.offer}</p>
                              <p>{item.quotedPrice || 'Price not established'}</p>
                              <small>{item.comparability}</small>
                            </div>
                          ))
                        ) : (
                          <p>No inspected comparable offers.</p>
                        )}
                        <h3>Risks & missing evidence</h3>
                        <ul>
                          {[...candidate.risks, ...candidate.evidenceGaps].map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                        <h3>Supplier checks</h3>
                        <ul>
                          {candidate.sourcingSteps.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </details>
                      <details>
                        <summary>Small-budget validation & ad angle</summary>
                        <ol>
                          {candidate.validationSteps.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ol>
                        <p>{candidate.adAngle}</p>
                      </details>
                      <details>
                        <summary>Calculate costs & ad allowance</summary>
                        <OpportunityCalculator
                          candidateId={`${data.business.id}:${candidate.id}`}
                          country={selected.input.country}
                        />
                      </details>
                      <div className="opportunity-actions">
                        <button
                          className="button secondary"
                          onClick={() => {
                            sessionStorage.setItem(
                              `adpilot-ad-library-search:${data.business.id}:${data.user.id}`,
                              JSON.stringify({
                                keyword: original.keywords[0],
                                country: selected.input.country,
                                pageId: '',
                              }),
                            );
                            setPage('Ad Library research');
                          }}
                        >
                          <Search size={16} />
                          Check competitor ads
                        </button>
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const brief = await api(`/discovery/${selected.id}/brief`, 'POST', {
                                candidateId: candidate.id,
                              });
                              sessionStorage.setItem(
                                `adpilot-research-selection:${data.business.id}`,
                                brief.id,
                              );
                              setPage('Research studio');
                            })
                          }
                        >
                          Research this idea
                          <ArrowRight size={16} />
                        </button>
                        <button
                          className="button primary"
                          onClick={() =>
                            showProduct(null, {
                              draftId: candidate.id,
                              name: original.name,
                              category: original.category,
                              description: '',
                              adLibraryIds: selected.input.adLibraryIds,
                            })
                          }
                        >
                          Add actual product
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {!candidates.length && (
                <p className="notice">
                  {shortlistOnly
                    ? 'No shortlisted ideas yet. Use the bookmark on an idea.'
                    : 'No defensible candidates were found. Add actual source observations and research again.'}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

import React, { useEffect, useState } from 'react';
import { ExternalLink, Search, Save, Sparkles, RefreshCw, Plus } from 'lucide-react';
import { countryNames } from '../src/modules/research/countries.js';
import {
  adLibrarySearchLink,
  canonicalAdLibraryLink,
} from '../src/modules/research/ad-library-links.js';
import { CampaignField } from './FieldHelp.jsx';
import { useDraft } from './use-draft.js';
import { useLanguage } from './i18n.js';
import { mediaUrl, uploadMedia } from './api.js';
import './ad-library.css';
import { useReportTranslation, ReportTranslationNotice } from './ReportTranslation.jsx';
import { Pagination, usePagination } from './Pagination.jsx';

function dhakaDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}
const emptyDraft = () => ({
  adUrl: '',
  pageName: '',
  country: 'BD',
  productId: null,
  projectId: null,
  statusObserved: 'unknown',
  observedDate: dhakaDate(),
  startDateObserved: '',
  adCopy: '',
  offer: '',
  landingUrl: '',
  notes: '',
  screenshotAssetIds: [],
});
const draftOf = (row) =>
  row
    ? Object.fromEntries(
        Object.keys(emptyDraft()).map((key) => [
          key,
          key === 'observedDate' ? dhakaDate(row.observedAt) : row[key],
        ]),
      )
    : emptyDraft();
const publicPayload = (draft) => {
  const { observedDate, ...fields } = draft;
  return { ...fields, observedAt: new Date(`${observedDate}T00:00:00+06:00`).toISOString() };
};
const Field = ({ label, help, children }) => (
  <CampaignField label={label} help={help}>
    {children}
  </CampaignField>
);
const external = { target: '_blank', rel: 'noopener noreferrer', referrerPolicy: 'no-referrer' };

function ObservationForm({
  row,
  data,
  assets,
  api,
  run,
  busy,
  save,
  analyze,
  pending,
  reload,
  searchCountry,
}) {
  const bn = useLanguage() === 'bn';
  const [draft, setDraft, clearDraft] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:ad-library:${row?.id || 'new'}`,
    () => draftOf(row),
  );
  const [media, setMedia] = useState(assets);
  useEffect(() => setMedia(assets), [assets]);
  useEffect(() => {
    if (!row)
      setDraft((current) => (current.adUrl ? current : { ...current, country: searchCountry }));
  }, [searchCountry, row?.id]);
  const dirty = row && JSON.stringify(draft) !== JSON.stringify(draftOf(row));
  const patch = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const context = draft.projectId
    ? `project:${draft.projectId}`
    : draft.productId
      ? `product:${draft.productId}`
      : '';
  const hasContent = Boolean(
    draft.adCopy || draft.offer || draft.notes || draft.screenshotAssetIds.length,
  );
  return (
    <article className="panel tools-panel ad-library-form">
      <h2>{row ? 'Edit saved ad' : '2. Save an ad you found'}</h2>
      <p>
        Open the ad details in Meta Ad Library. Copy its individual link or Library ID and its real
        ad text. Add screenshots to analyze the creative.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            const saved = await save(publicPayload(draft), row);
            setDraft(draftOf(saved));
            clearDraft();
          }, 'Ad observation saved.');
        }}
      >
        <Field
          label="Ad Library link or Library ID"
          help="Use an individual ad link with ?id= or the numeric Library ID shown in ad details. A keyword search link is not an individual ad."
        >
          <input
            required
            maxLength={2000}
            value={draft.adUrl}
            onChange={(e) => patch('adUrl', e.target.value)}
            onBlur={() => {
              const url = canonicalAdLibraryLink(draft.adUrl);
              if (url) patch('adUrl', url);
            }}
            placeholder="https://www.facebook.com/ads/library/?id=123456789"
          />
        </Field>
        <div className="form-grid">
          <Field
            label="Advertiser / Facebook Page name"
            help="Copy the advertiser name shown on the ad. This is the competitor, not your own Page."
          >
            <input
              required
              minLength={2}
              maxLength={200}
              value={draft.pageName}
              onChange={(e) => patch('pageName', e.target.value)}
            />
          </Field>
          <Field
            label="Link to your product or research brief"
            help="Linked observations are automatically included in the next research for this product or brief. Existing approved reports stay as their original snapshots."
          >
            <select
              value={context}
              onChange={(e) => {
                const [type, id] = e.target.value.split(':');
                setDraft((current) => ({
                  ...current,
                  productId: type === 'product' ? id : null,
                  projectId: type === 'project' ? id : null,
                }));
              }}
            >
              <option value="">Keep as general inspiration</option>
              {data.products.map((p) => (
                <option value={`product:${p.id}`} key={p.id}>{`Product: ${p.name}`}</option>
              ))}
              {data.researchProjects.map((p) => (
                <option value={`project:${p.id}`} key={p.id}>{`Research: ${p.name}`}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Country searched"
            help="The country filter you used in Ad Library. It does not establish the competitor's exact targeting."
          >
            <select value={draft.country} onChange={(e) => patch('country', e.target.value)}>
              <option value="ALL">All countries</option>
              {Object.entries(countryNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Status you observed"
            help="Record what Ad Library showed on the observation date. Leave unknown if you did not check it; the app does not automatically check live status."
          >
            <select
              value={draft.statusObserved}
              onChange={(e) => patch('statusObserved', e.target.value)}
            >
              <option value="unknown">Not checked</option>
              <option value="active">Shown as active</option>
              <option value="inactive">Shown as inactive</option>
            </select>
          </Field>
          <Field
            label="Date you checked the ad"
            help="Use the date you actually inspected the ad. Dates are presented in Asia/Dhaka."
          >
            <input
              type="date"
              required
              max={dhakaDate()}
              value={draft.observedDate}
              onChange={(e) => patch('observedDate', e.target.value)}
            />
          </Field>
          <Field
            label="Ad start date (if shown)"
            help="Copy the displayed start date or leave empty. How long an ad runs does not prove profit."
          >
            <input
              type="date"
              max={draft.observedDate}
              value={draft.startDateObserved}
              onChange={(e) => patch('startDateObserved', e.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Actual ad copy"
          help="Paste the ad headline and main text as shown. The AI treats this as competitor content, not instructions."
        >
          <textarea
            rows={4}
            maxLength={6000}
            value={draft.adCopy}
            onChange={(e) => patch('adCopy', e.target.value)}
          />
        </Field>
        <Field
          label="Offer / price shown (optional)"
          help="Record the actual advertised offer and currency. Do not guess a missing price; this text will not change your product economics."
        >
          <textarea
            rows={2}
            maxLength={1000}
            value={draft.offer}
            onChange={(e) => patch('offer', e.target.value)}
          />
        </Field>
        <Field
          label="Competitor landing page (optional)"
          help="Paste the public HTTPS destination if you checked it. This is a reference link; it is not fetched automatically."
        >
          <input
            type="url"
            maxLength={1000}
            value={draft.landingUrl}
            onChange={(e) => patch('landingUrl', e.target.value)}
          />
        </Field>
        <Field
          label="Your observation notes"
          help="Record visible facts, questions or differences from your offer. Avoid guessing their sales or profit."
        >
          <textarea
            rows={2}
            maxLength={2000}
            value={draft.notes}
            onChange={(e) => patch('notes', e.target.value)}
          />
        </Field>
        <Field
          label="Upload ad screenshots"
          help="JPEG, PNG or WebP, up to four images and 20 MB combined. For video ads, add screenshots of important frames; full video analysis is not included."
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || draft.screenshotAssetIds.length >= 4}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              run(async () => {
                const asset = await uploadMedia(file);
                setMedia((current) => [...current, asset]);
                setDraft((current) => ({
                  ...current,
                  screenshotAssetIds: [...current.screenshotAssetIds, asset.id].slice(0, 4),
                }));
              });
              e.target.value = '';
            }}
          />
        </Field>
        <fieldset className="ad-library-media">
          <legend>Select ad screenshots from Media library</legend>
          <p>Choose the competitor ad screenshots, not your own product photographs.</p>
          {media
            .filter((a) => a.type === 'image')
            .map((asset) => (
              <label key={asset.id}>
                <input
                  type="checkbox"
                  checked={draft.screenshotAssetIds.includes(asset.id)}
                  disabled={
                    !draft.screenshotAssetIds.includes(asset.id) &&
                    draft.screenshotAssetIds.length >= 4
                  }
                  onChange={(e) =>
                    patch(
                      'screenshotAssetIds',
                      e.target.checked
                        ? [...draft.screenshotAssetIds, asset.id]
                        : draft.screenshotAssetIds.filter((id) => id !== asset.id),
                    )
                  }
                />
                <span>{asset.name}</span>
              </label>
            ))}
          {!media.some((a) => a.type === 'image') && <p>No screenshots uploaded yet.</p>}
        </fieldset>
        <div className="ad-library-previews">
          {draft.screenshotAssetIds.map((id) => (
            <a {...external} href={mediaUrl(id)} key={id}>
              <img src={mediaUrl(id)} alt={bn ? 'সংরক্ষিত ad screenshot' : 'Saved ad screenshot'} />
            </a>
          ))}
        </div>
        <div className="guide-actions">
          <button className="button" disabled={busy}>
            <Save size={17} />
            {row ? 'Update ad observation' : 'Save ad observation'}
          </button>
          {row && (
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const next = await reload();
                  const saved = next.observations.find((item) => item.id === row.id);
                  if (saved) {
                    clearDraft();
                    setDraft(draftOf(saved));
                  }
                })
              }
            >
              Reload saved version
            </button>
          )}
        </div>
      </form>
      {row && (
        <div className="ad-library-analyze">
          <h3>3. Analyze and compare</h3>
          <p>
            Ad Library browsing is free. AI analysis uses your connected provider and its normal API
            usage.
          </p>
          {dirty && <p className="notice">Save your edits before analyzing.</p>}
          {!hasContent && (
            <p>Add ad copy or a screenshot to enable analysis. A link alone is a bookmark.</p>
          )}
          <button
            type="button"
            className="button"
            disabled={
              busy ||
              dirty ||
              pending ||
              row.archived ||
              !hasContent ||
              (data.mode !== 'demo' && !data.aiIntegration.configured)
            }
            onClick={() => run(() => analyze(row))}
          >
            <Sparkles size={17} />
            {pending ? 'Analysis is running…' : 'Analyze saved ad with AI'}
          </button>
          {data.mode !== 'demo' && !data.aiIntegration.configured && (
            <p>Connect your AI provider in Accounts first.</p>
          )}
          {row.archived && <p>Restore this observation before analyzing it.</p>}
        </div>
      )}
    </article>
  );
}

export function AdLibraryAnalysis({ row }) {
  const bn = useLanguage() === 'bn';
  const analysis = row.analysis;
  const translation = useReportTranslation('ad', row.id, analysis?.report, row.businessId);
  const report = translation.report;
  if (!analysis) return null;
  const sections = [
    ['visibleObservations', 'Observed creative and copy'],
    ['hooks', 'Hooks and message angles'],
    ['audienceHypotheses', 'Buyer hypotheses - not verified targeting'],
    ['strengths', 'Useful patterns'],
    ['weaknesses', 'Weaknesses and risks'],
    ['differentiation', 'How your offer can differ'],
    ['testIdeas', 'Small-budget test ideas'],
    ['evidenceGaps', 'Evidence still needed'],
  ];
  return (
    <article className="panel tools-panel ad-library-analysis">
      <h2>Ad analysis</h2>
      <ReportTranslationNotice translation={translation} />
      <p>
        <a {...external} href={row.adUrl}>
          {row.pageName} · {row.libraryAdId}
        </a>
      </p>
      <p className="draft-note">
        {analysis.model} · {analysis.thinking} · {dhakaDate(analysis.analyzedAt)} ·{' '}
        {bn ? 'Confidence: যাচাই বাকি' : 'Confidence: unverified observations'}
      </p>
      {analysis.demo && <p className="notice">Demo analysis only. No live AI model was called.</p>}
      {row.analysisStale && (
        <p className="notice">
          This is an earlier analysis. The ad or linked offer changed; save and analyze the current
          version again. Earlier AI conclusions are excluded from new research until refreshed.
        </p>
      )}
      <p>{report.summary}</p>
      <h3>Offer comparison</h3>
      <p>{report.offerAnalysis}</p>
      {sections.map(
        ([key, label]) =>
          report[key]?.length > 0 && (
            <section key={key}>
              <h3>{label}</h3>
              <ul>
                {report[key].map((text, i) => (
                  <li key={i}>{text}</li>
                ))}
              </ul>
            </section>
          ),
      )}
      <p className="notice">
        Competitor spend, conversions, CPA, ROAS and profit are unknown. Public ads are creative
        research examples; they do not establish a winning campaign.
      </p>
    </article>
  );
}

export function AdLibraryResearch({ data, api, run, busy, setPage, refresh, showPlan }) {
  const bn = useLanguage() === 'bn';
  const key = `${data.business.id}:${data.user.id}`;
  const openWorkbench = (projectId, kind) => {
    const physical =
      (kind || data.researchProjects?.find((item) => item.id === projectId)?.kind) ===
      'physical-product';
    if (projectId)
      sessionStorage.setItem(
        `adpilot-${physical ? 'product-research' : 'research'}-selection:${data.business.id}`,
        projectId,
      );
    setPage(physical ? 'Product research' : 'Research studio');
  };
  const [search, setSearch] = useDraft(`adpilot-ad-library-search:${key}`, {
    keyword: data.products[0]?.name.slice(0, 100) || '',
    country: 'BD',
    pageId: '',
  });
  const [selectedId, setSelectedId] = useDraft(`adpilot-ad-library-selection:${key}`, '');
  const [payload, setPayload] = useState(null),
    [assets, setAssets] = useState([]),
    [error, setError] = useState(''),
    [showArchived, setShowArchived] = useState(false);
  const load = async () => {
    const next = await api('/ad-library');
    setPayload(next);
    setError('');
    if (refresh) await refresh();
    return next;
  };
  useEffect(() => {
    let cancelled = false;
    Promise.all([api('/ad-library'), api('/media')])
      .then(([next, media]) => {
        if (!cancelled) {
          setPayload(next);
          setAssets(media);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [data.business.id]);
  const polling = payload?.jobs.some((job) => ['queued', 'running'].includes(job.status));
  useEffect(() => {
    if (!polling) return;
    let cancelled = false;
    const timer = setInterval(
      () =>
        api('/ad-library')
          .then((value) => {
            if (!cancelled) {
              setPayload(value);
              if (refresh) refresh().catch(() => {});
              setError('');
            }
          })
          .catch((e) => {
            if (!cancelled) setError(e.message);
          }),
      5000,
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [polling, data.business.id]);
  const selected = payload?.observations.find((row) => row.id === selectedId);
  const savedAds = (payload?.observations || []).filter((row) => showArchived || !row.archived);
  const pagination = usePagination(savedAds, {
    pageSize: 8,
    resetKey: `${data.business.id}:${showArchived}`,
  });
  const selectedJob = payload?.jobs.find((job) => job.observationId === selectedId);
  const pending = ['queued', 'running'].includes(selectedJob?.status);
  const keywordSuggestions = [
    ...new Set([
      ...(data.products.some((p) => /three.?piece|dupatta|lawn/i.test(`${p.name} ${p.category}`))
        ? ['three piece', 'থ্রি পিস']
        : []),
      ...data.products.map((p) => p.name.slice(0, 100)),
      ...data.researchProjects.map((p) => p.name.slice(0, 100)),
    ]),
  ].slice(0, 6);
  async function save(fields, row) {
    const saved = await api(row ? `/ad-library/${row.id}` : '/ad-library', row ? 'PUT' : 'POST', {
      ...fields,
      ...(row ? { expectedRevision: row.revision } : {}),
    });
    await load();
    setAssets(await api('/media'));
    setSelectedId(saved.id);
    pagination.setPage(1);
    return saved;
  }
  async function analyze(row) {
    await api(`/ad-library/${row.id}/analyze`, 'POST', {});
    await load();
  }
  async function archive(row) {
    await api(`/ad-library/${row.id}/archive`, 'POST', {
      archived: !row.archived,
      expectedRevision: row.revision,
    });
    await load();
    if (!row.archived) setSelectedId('');
  }
  async function renew(kind, id) {
    const result = await api('/ad-library/refresh-research', 'POST', { kind, id });
    await load();
    if (!result.queued && kind === 'product') showPlan(result.result);
  }
  return (
    <>
      <div className="tools-heading">
        <span className="eyebrow">COMPETITOR RESEARCH</span>
        <h1>Ad Library research</h1>
        <p>
          Find public competitor ads for free, save dated examples and compare them with your own
          offer.
        </p>
      </div>
      {(data.plans.some((p) => p.status === 'needs_research') ||
        data.researchProjects.some((p) => p.status === 'needs_research')) && (
        <section className="panel tools-panel">
          <h2>Reports needing fresh research and review</h2>
          <p>
            Linked competitor evidence changed. Earlier reports and approvals remain in history;
            generate a new report and review it again before launching.
          </p>
          {[
            ...new Set(
              data.plans
                .filter(
                  (p) =>
                    p.status === 'needs_research' &&
                    !p.researchProjectId &&
                    p.kind !== 'product-group',
                )
                .map((p) => p.productId),
            ),
          ].map((id) => (
            <div className="guide-actions" key={id}>
              <strong>{data.products.find((p) => p.id === id)?.name}</strong>
              <button
                className="button secondary"
                disabled={
                  busy ||
                  payload?.jobs.some(
                    (j) => j.targetId === id && ['queued', 'running'].includes(j.status),
                  )
                }
                onClick={() => run(() => renew('product', id))}
              >
                Regenerate product research
              </button>
            </div>
          ))}
          {data.researchProjects
            .filter((p) => p.status === 'needs_research')
            .map((p) => (
              <div className="guide-actions" key={p.id}>
                <strong>{p.name}</strong>
                <button
                  className="button secondary"
                  disabled={
                    busy ||
                    payload?.jobs.some(
                      (j) => j.targetId === p.id && ['queued', 'running'].includes(j.status),
                    )
                  }
                  onClick={() => run(() => renew('research', p.id))}
                >
                  Regenerate research brief
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    openWorkbench(p.id, p.kind);
                  }}
                >
                  Open Research studio
                </button>
              </div>
            ))}
          {data.plans.some((p) => p.status === 'needs_research' && p.kind === 'product-group') && (
            <button className="button secondary" onClick={() => setPage('Products')}>
              Regenerate the product group in Products
            </button>
          )}
        </section>
      )}
      {payload?.jobs.some((j) => j.type === 'ad-evidence-refresh') && (
        <section className="panel tools-panel">
          <h2>Research regeneration</h2>
          {payload.jobs
            .filter((j) => j.type === 'ad-evidence-refresh')
            .slice(0, 8)
            .map((j) => (
              <article className="guide-step" key={j.id}>
                <p>
                  {j.status}
                  {j.errorMessage ? ` · ${j.errorMessage}` : ''}
                </p>
                {j.planId && (
                  <button
                    className="button secondary"
                    onClick={() => run(async () => showPlan(await api(`/plans/${j.planId}`)))}
                  >
                    Review newly generated plan
                  </button>
                )}
                {j.versionId && (
                  <button
                    className="button secondary"
                    onClick={() => {
                      openWorkbench(j.targetId);
                    }}
                  >
                    Review new research version
                  </button>
                )}
              </article>
            ))}
        </section>
      )}
      <div className="notice ad-library-intro">
        <strong>Free public Ad Library - no Meta API key needed.</strong>
        <p>
          Search opens Meta in another tab. Paste the ad content or upload screenshots here. This
          workspace does not automatically scrape Facebook or import every running ad.
        </p>
        <a {...external} href="https://www.facebook.com/ads/library/">
          Open Meta Ad Library
        </a>
      </div>
      <article className="panel tools-panel">
        <h2>1. Find competitor ads</h2>
        <p>
          Use a short product keyword in Bangla or English, or an advertiser Page ID. Select the
          country you want to inspect.
        </p>
        <div className="form-grid">
          <Field
            label="Product keyword or advertiser name"
            help="Try short phrases such as three piece, থ্রি পিস, tote bag or custom ecommerce. Long exact product names may miss relevant ads."
          >
            <input
              maxLength={100}
              value={search.keyword}
              onChange={(e) => setSearch({ ...search, keyword: e.target.value })}
            />
          </Field>
          <Field
            label="Search country"
            help="This opens Meta's country filter. It does not guarantee any competitor is targeting a specific city or state."
          >
            <select
              value={search.country}
              onChange={(e) => setSearch({ ...search, country: e.target.value })}
            >
              <option value="ALL">All countries</option>
              {Object.entries(countryNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Competitor Page ID (optional)"
            help="Use the numeric public Page ID to search that advertiser. Leave empty to search by keyword."
          >
            <input
              inputMode="numeric"
              maxLength={30}
              value={search.pageId}
              onChange={(e) => setSearch({ ...search, pageId: e.target.value.replace(/\D/g, '') })}
            />
          </Field>
        </div>
        <div className="ad-library-suggestions">
          {keywordSuggestions.map((keyword) => (
            <button
              className="secondary"
              type="button"
              key={keyword}
              onClick={() => setSearch({ ...search, keyword, pageId: '' })}
            >
              {keyword}
            </button>
          ))}
        </div>
        <a className="button" {...external} href={adLibrarySearchLink(search)}>
          <Search size={17} />
          Open free Ad Library search
          <ExternalLink size={15} />
        </a>
        <p className="draft-note">
          On Meta, open an ad's details, copy its Library ID/link, copy the ad text and take a
          screenshot. Return here to save it. Some ads or details may be unavailable.
        </p>
      </article>
      {error && (
        <div role="alert" className="notice">
          {error}
          <button type="button" onClick={() => run(load)}>
            Retry loading saved ads
          </button>
        </div>
      )}
      {!payload ? (
        <p>Loading saved ads…</p>
      ) : (
        <div className="ad-library-layout">
          <aside className="panel tools-panel ad-library-saved">
            <h2>Saved competitor ads</h2>
            <div className="guide-actions">
              <button className="button secondary" onClick={() => setSelectedId('')}>
                <Plus size={16} />
                Save another ad
              </button>
              <button
                className="icon-button"
                aria-label="Refresh saved ads"
                disabled={busy}
                onClick={() => run(load)}
              >
                <RefreshCw size={18} />
              </button>
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived observations
            </label>
            {pagination.items.map((row) => (
              <article
                className={`ad-library-card ${row.id === selectedId ? 'selected' : ''}`}
                key={row.id}
              >
                <button className="ad-library-select" onClick={() => setSelectedId(row.id)}>
                  <strong>{row.pageName}</strong>
                  <span>
                    {row.country} · {dhakaDate(row.observedAt)}
                  </span>
                  <small>{row.adCopy.slice(0, 140) || row.offer || 'Saved reference'}</small>
                </button>
                <small>
                  {bn ? 'আপনার দেখা status:' : 'Status you observed:'} {row.statusObserved}{' '}
                  {row.archived ? '· Archived' : ''}
                </small>
                <div className="guide-actions">
                  <a {...external} href={row.adUrl}>
                    Original ad
                  </a>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => run(() => archive(row))}
                  >
                    {row.archived ? 'Restore observation' : 'Archive observation'}
                  </button>
                </div>
              </article>
            ))}
            <Pagination pagination={pagination} label="Saved competitor ads" sizes={[8, 16, 32]} />
            {!payload.observations.length && (
              <p>
                No competitor ads saved yet. Start with three relevant ads from different sellers.
              </p>
            )}
            <p className="draft-note">
              Linked examples feed into your next research. General inspiration is kept on this
              board. Archived examples are excluded from new research.
            </p>
            <button className="button secondary" onClick={() => setPage('Research studio')}>
              Continue in Research studio
            </button>
          </aside>
          <div className="ad-library-detail">
            <ObservationForm
              key={selected?.id || 'new'}
              row={selected}
              data={data}
              assets={assets}
              api={api}
              run={run}
              busy={busy}
              save={save}
              analyze={analyze}
              pending={pending}
              reload={load}
              searchCountry={search.country}
            />
            {selectedJob && (
              <div role="status" className="notice">
                {bn ? 'AI analysis-এর অবস্থা:' : 'AI analysis status:'} {selectedJob.status}
                {selectedJob.errorMessage ? ` · ${selectedJob.errorMessage}` : ''}
              </div>
            )}
            {selected && <AdLibraryAnalysis row={selected} />}
          </div>
        </div>
      )}
    </>
  );
}

export function AdLibraryResearchSources({ observations = [] }) {
  const bn = useLanguage() === 'bn';
  if (!observations.length) return null;
  return (
    <section className="guide-step">
      <h3>{bn ? 'এই research-এ ব্যবহৃত competitor ad' : 'Competitor ads used in this research'}</h3>
      <p>
        {bn
          ? 'আপনার সংরক্ষিত পর্যবেক্ষণ। এগুলো competitor-এর লাভ বা buyer demand যাচাই করে না।'
          : 'Your saved dated observations. These do not establish competitor profit or buyer demand.'}
      </p>
      <ul>
        {observations.map((ad) => (
          <li key={ad.id}>
            <a {...external} href={ad.source}>
              {ad.pageName}
            </a>{' '}
            · {ad.countryObserved} · {dhakaDate(ad.observedAt)}
            {ad.analysis ? ' · AI analysis included' : ' · Owner observation only'}
          </li>
        ))}
      </ul>
    </section>
  );
}

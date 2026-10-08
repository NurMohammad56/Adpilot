import React, { useEffect, useState } from 'react';
import {
  Upload,
  Image,
  Video,
  Globe,
  Plus,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  Save,
} from 'lucide-react';
import './workspace-tools.css';
import { MetaConnection } from './MetaConnection.jsx';
import { AIConnection, ResearchRetrieval } from './AIConnection.jsx';
import { useDraft } from './use-draft.js';
import { getLanguage } from './i18n.js';
import { uploadMedia } from './api.js';
import { CampaignSetup } from './CampaignSetup.jsx';
import { CampaignField } from './FieldHelp.jsx';
import { RegionPicker } from './RegionPicker.jsx';
const Field = ({ label, children, hint, help }) =>
  help ? (
    <CampaignField label={label} help={help} hint={hint}>
      {children}
    </CampaignField>
  ) : (
    <label className="field">
      <span>{label}</span>
      {React.isValidElement(children) && ['input', 'textarea', 'select'].includes(children.type)
        ? React.cloneElement(children, { 'aria-label': label })
        : children}
      {hint && <small>{hint}</small>}
    </label>
  );
import { countryNames as Countries } from '../src/modules/research/countries.js';
const Heading = ({ title, children }) => (
  <div className="tools-heading">
    <span className="eyebrow">YOUR WORKSPACE</span>
    <h1>{title}</h1>
    <p>{children}</p>
  </div>
);
export function Accounts({ data, api, run, refresh, busy, onSwitch }) {
  const [spaces, setSpaces] = useState([]);
  const [newName, setNewName] = useState('');
  useEffect(() => {
    api('/workspaces')
      .then(setSpaces)
      .catch(() => {});
  }, [data.business.id]);
  const admin = data.user.role === 'admin';
  return (
    <>
      <Heading title="Accounts & workspaces">
        Connect your own Page, ad account, Pixel and AI provider. Each workspace keeps its uploads,
        research, budgets and campaigns separate.
      </Heading>
      <div className="tools-columns">
        <article className="panel tools-panel">
          <h2>Select a workspace</h2>
          <div className="workspace-options">
            {spaces.map((space) => (
              <button
                key={space.id}
                className={`workspace-option ${space.active ? 'selected' : ''}`}
                onClick={() => !space.active && onSwitch(space.id)}
                disabled={busy}
              >
                <Globe size={20} />
                <span>
                  <strong>{space.name}</strong>
                  <small>
                    {space.role} · {space.active ? 'Current workspace' : 'Switch workspace'}
                  </small>
                </span>
                {space.active && <ShieldCheck size={17} />}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const space = await api('/workspaces', 'POST', { name: newName });
                await onSwitch(space.id, true);
                setNewName('');
              }, 'New workspace created. Connect its accounts below.');
            }}
          >
            <Field label="New workspace name">
              <input
                required
                minLength={2}
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Client business / Facebook Page"
              />
            </Field>
            <button className="button secondary" disabled={busy}>
              <Plus size={16} />
              Create separate workspace
            </button>
          </form>
        </article>
        <article className="panel tools-panel">
          <h2>Connection status</h2>
          <dl className="connection-facts">
            <dt>Business / Page context</dt>
            <dd>{data.business.name}</dd>
            <dt>Meta account</dt>
            <dd>
              {data.mode === 'demo'
                ? 'Simulated demo adapter'
                : data.integration.configured
                  ? `${data.integration.name} (${data.integration.adAccountId})`
                  : 'Not connected'}
            </dd>
            <dt>Facebook Page</dt>
            <dd>{data.integration.pageName || data.integration.pageId || 'Not connected'}</dd>
            <dt>Pixel / dataset</dt>
            <dd>{data.integration.pixelId || 'Not connected'}</dd>
            <dt>Budget currency</dt>
            <dd>{data.integration.currency || 'BDT'}</dd>
            <dt>AI provider</dt>
            <dd>
              {data.mode === 'demo'
                ? 'Simulated demo adapter'
                : data.aiIntegration?.configured
                  ? `${data.aiIntegration.provider} · ${data.aiIntegration.model}`
                  : 'Connect your own AI key'}
            </dd>
            <dt>Research model</dt>
            <dd>{data.aiIntegration?.researchModel || 'Not connected'}</dd>
            <dt>Research thinking effort</dt>
            <dd>{data.aiIntegration?.researchThinking || 'high'}</dd>
          </dl>
          <div className="notice">
            <ShieldCheck size={19} />
            Account credentials are encrypted on the server. Approval applies only to this
            workspace.
          </div>
        </article>
      </div>
      {data.mode === 'demo' ? (
        <div className="notice">
          Demo workspaces simulate advertising and research. Real account credentials are configured
          in live mode.
        </div>
      ) : (
        <div className="tools-columns">
          <MetaConnection data={data} api={api} run={run} refresh={refresh} busy={busy} />
          <AIConnection data={data} api={api} run={run} refresh={refresh} busy={busy} />
        </div>
      )}
    </>
  );
}
export function MediaPicker({ api, value, thumbnail, onChange }) {
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    api('/media')
      .then(setAssets)
      .catch((error) => setError(error.message));
  }, []);
  const selected = assets.find((asset) => asset.id === value);
  return (
    <div className="media-picker">
      <CampaignField
        label="Upload a creative here"
        help="Upload a real image or video showing your service or product. Images can be JPEG, PNG or WebP, up to 10 MB. Videos can be MP4 or WebM, up to 50 MB."
        hint="Upload directly without leaving this form. Images: 10 MB. Videos: 50 MB."
      >
        <input
          aria-label="Upload a creative here"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          disabled={uploading}
          onChange={async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            setUploading(true);
            setError('');
            try {
              const uploaded = await uploadMedia(file);
              setAssets(await api('/media'));
              onChange(uploaded.id, null);
            } catch (error) {
              setError(error.message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </CampaignField>
      {uploading && <p role="status">Uploading your private creative…</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <Field
        label="Uploaded image or video"
        help="Choose a file from this workspace media library. It will be used in your ad. Uploading a file does not publish an ad."
      >
        <select
          value={value || ''}
          onChange={(event) => onChange(event.target.value || null, null)}
        >
          <option value="">Choose an uploaded image or video</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} · {asset.type}
            </option>
          ))}
        </select>
      </Field>
      {selected && (
        <div className="media-preview">
          {selected.type === 'video' ? (
            <video src={selected.contentUrl} controls preload="metadata" />
          ) : (
            <img src={selected.contentUrl} alt={selected.name} />
          )}
        </div>
      )}
      {selected?.type === 'video' && (
        <Field
          label="Video cover image"
          help="Choose a still image to show before your video plays. An uploaded video needs a cover image before the campaign can be approved."
        >
          <select
            value={thumbnail || ''}
            required
            onChange={(event) => onChange(value, event.target.value || null)}
          >
            <option value="">Select an uploaded cover image</option>
            {assets
              .filter((asset) => asset.type === 'image')
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
          </select>
        </Field>
      )}
    </div>
  );
}
export function MediaLibrary({ data, api, run, busy }) {
  const [assets, setAssets] = useState([]);
  const [loadError, setLoadError] = useState('');
  const load = () => api('/media').then(setAssets);
  useEffect(() => {
    load().catch((error) => setLoadError(error.message));
  }, [data.business.id]);
  return (
    <>
      <Heading title="Media library">
        Upload your real product images, service screenshots and video demonstrations. Choose them
        when reviewing a campaign.
      </Heading>
      <div className="notice">
        {data.storage?.driver === 's3'
          ? 'Private cloud storage is connected. Files are accessible only to workspace members.'
          : 'Files are stored privately on this server. Use persistent storage when hosting.'}
      </div>
      {loadError && (
        <p className="field-error" role="alert">
          {loadError}
        </p>
      )}
      <article className="panel tools-panel">
        <form
          className="upload-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const file = form.elements.file.files[0];
            if (!file) return;
            run(async () => {
              await uploadMedia(file);
              await load();
              setLoadError('');
              form.reset();
            }, 'File uploaded privately to this workspace.');
          }}
        >
          <Upload size={30} />
          <div>
            <strong>Images up to 10 MB · videos up to 50 MB</strong>
            <p>
              JPEG, PNG, WebP, MP4 and WebM. A video needs an uploaded image as its cover. Workspace
              storage limit: 2 GB.
            </p>
            <input
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
              required
              aria-label="Media file"
            />
          </div>
          <button className="button primary" disabled={busy}>
            <Upload size={16} />
            Upload file
          </button>
        </form>
      </article>
      <div className="media-grid">
        {assets.map((asset) => (
          <article className="panel media-card" key={asset.id}>
            <div className="media-preview">
              {asset.type === 'image' ? (
                <img src={asset.contentUrl} alt={asset.name} loading="lazy" />
              ) : (
                <video src={asset.contentUrl} controls preload="metadata" />
              )}
            </div>
            <strong>{asset.name}</strong>
            <small>
              {asset.type === 'image' ? <Image size={14} /> : <Video size={14} />}{' '}
              {(asset.size / 1024 / 1024).toFixed(2)} MB · Private to {data.business.name}
            </small>
          </article>
        ))}
      </div>
      {!assets.length && (
        <div className="panel tools-panel">
          <h3>Your media library is empty</h3>
          <p>
            Upload an image or video, then select it in a campaign draft. Uploading alone does not
            publish an ad.
          </p>
        </div>
      )}
    </>
  );
}
const emptyBrief = {
  candidateLocationIds: [],
  name: '',
  kind: 'service',
  description: '',
  buyerProfile: '',
  candidateCountries: ['BD', 'US', 'GB'],
  questions: '',
  evidence: [],
  productId: null,
};
export function ResearchDesk({ data, api, run, busy, refresh, onPlan }) {
  const [locations, setLocations] = useState([]);
  const [countryQuery, setCountryQuery] = useState('');
  const mergeLocations = (rows) =>
    setLocations((current) => [
      ...current.filter((row) => !rows.some((next) => next.id === row.id)),
      ...rows,
    ]);
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [briefDrafts, setBriefDrafts] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:research-briefs`,
    { new: emptyBrief },
  );
  const briefKey = project?.id || 'new';
  const brief =
    briefDrafts[briefKey] ||
    (project
      ? Object.fromEntries(Object.keys(emptyBrief).map((key) => [key, project[key]]))
      : emptyBrief);
  const setBrief = (value) => setBriefDrafts((current) => ({ ...current, [briefKey]: value }));
  const [briefEditing, setBriefEditing] = useState(false);
  const [versions, setVersions] = useState([]);
  const [versionId, setVersionId] = useState('');
  const [followup, setFollowup] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:research-followup:${project?.id || 'new'}`,
    '',
  );
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:decision:${versionId}`,
    { summary: '', country: '', reason: '', note: '' },
  );
  const [campaign, setCampaign] = useState(false);
  const [media, setMedia] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:campaign-media:${versionId}`,
    { mediaAssetId: null, thumbnailAssetId: null },
  );
  const [campaignFields, setCampaignFields] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:campaign:${versionId}`,
    {
      goal: 'leads',
      landingUrl: '',
      price: '',
      deliveryCost: '',
      requiredProfit: '',
      leadCloseRate: '',
      dailyBudget: '',
      durationDays: '7',
      testBudgetCeiling: '',
      budgetPreference: 'starter',
      manualCeiling: false,
      budgetCurrency: data.integration.currency || 'BDT',
      economicsMode: 'unknown',
      acknowledgeUnknownCPA: false,
    },
  );
  const loadProjects = async () => {
    setLocations(await api('/research/locations'));
    const values = await api('/research');
    setProjects(values);
    return values;
  };
  useEffect(() => {
    loadProjects()
      .then((values) => {
        const saved = sessionStorage.getItem(`adpilot-research-selection:${data.business.id}`);
        const selected = values.find((item) => item.id === saved);
        if (selected) return select(selected);
      })
      .catch((error) =>
        run(() => {
          throw error;
        }),
      );
  }, [data.business.id]);
  async function select(selected) {
    setProject(selected);
    sessionStorage.setItem(`adpilot-research-selection:${data.business.id}`, selected.id);
    const history = await api(`/research/${selected.id}/versions`);
    setVersions(history);
    setVersionId(selected.currentVersionId || history.at(-1)?.id || '');
    setEditing(false);
    setCampaign(false);
    setBriefEditing(false);
  }
  async function reload(projectId) {
    const values = await loadProjects();
    const selected = values.find((item) => item.id === projectId);
    await select(selected);
    await refresh();
  }
  const version = versions.find((item) => item.id === versionId);
  const current = version?.id === project?.currentVersionId;
  const canApprove = ['admin', 'approver'].includes(data.user.role);
  function openDecisionEditor() {
    if (!decision.summary && !decision.reason)
      setDecision({
        summary: version.report.summary,
        country: version.report.recommendation.country || '',
        locationIds: version.report.recommendation.locationIds || [],
        reason: version.report.recommendation.reason,
        note: '',
      });
    setEditing(true);
  }
  return (
    <>
      <Heading title="Research studio">
        Discuss an offer, compare countries, refine the evidence and keep every decision version.
        Research approval and campaign launch approval are separate.
      </Heading>
      <div className="research-layout">
        <aside className="panel tools-panel research-projects">
          <button
            className="button secondary full"
            onClick={() => {
              sessionStorage.removeItem(`adpilot-research-selection:${data.business.id}`);
              setProject(null);
              setBriefDrafts((current) => ({ ...current, new: emptyBrief }));
              setVersions([]);
              setBriefEditing(false);
            }}
          >
            <Plus size={16} />
            New research brief
          </button>
          {projects.map((item) => (
            <button
              key={item.id}
              className={`research-project ${project?.id === item.id ? 'selected' : ''}`}
              disabled={busy}
              onClick={() => run(() => select(item))}
            >
              <strong>{item.name}</strong>
              <small>
                {item.kind} · {item.status} · {item.candidateCountries.join(', ')}
              </small>
            </button>
          ))}
        </aside>
        <section className="research-main">
          {!project || briefEditing ? (
            <article className="panel tools-panel">
              <h2>{project ? 'Edit research brief' : 'What would you like to research?'}</h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  run(async () => {
                    const saved = await api(
                      project ? `/research/${project.id}` : '/research',
                      project ? 'PUT' : 'POST',
                      brief,
                    );
                    setBriefDrafts((current) => {
                      const updated = { ...current };
                      delete updated[briefKey];
                      return updated;
                    });
                    await loadProjects();
                    await select(saved);
                  }, 'Brief saved. Run research or add a focused question.');
                }}
              >
                {!project && (
                  <Field
                    label="Start with a guided example"
                    hint="Examples help write a brief. The suggested countries are candidates to investigate, not recommended markets."
                  >
                    <select
                      value=""
                      onChange={(event) => {
                        const examples = {
                          ecommerce: {
                            kind: 'service',
                            name: 'Custom ecommerce development',
                            description:
                              'Custom ecommerce applications with product catalog, checkout and order management for established retailers.',
                            buyerProfile:
                              'Retail business owners with an existing customer base who need an online store.',
                            candidateCountries: ['BD', 'US', 'GB', 'AE'],
                          },
                          website: {
                            kind: 'service',
                            name: 'Business website development',
                            description:
                              'Business websites with service pages, enquiry forms and basic analytics.',
                            buyerProfile:
                              'Small business owners who need a professional website and qualified enquiries.',
                            candidateCountries: ['US', 'GB', 'CA', 'AU'],
                          },
                          software: {
                            kind: 'software',
                            name: 'Business software subscription',
                            description:
                              'A software application that solves a clearly defined daily business workflow.',
                            buyerProfile:
                              'Business operators with a recurring workflow problem and a budget for software.',
                            candidateCountries: ['BD', 'US', 'GB', 'IN'],
                          },
                          product: {
                            kind: 'physical-product',
                            name: '',
                            description: '',
                            buyerProfile:
                              'Bangladesh buyers who can be reached and served within our delivery coverage.',
                            candidateCountries: ['BD'],
                          },
                        };
                        if (examples[event.target.value])
                          setBrief({ ...brief, ...examples[event.target.value], productId: null });
                      }}
                    >
                      <option value="">Choose an example or write your own brief</option>
                      <option value="ecommerce">Custom ecommerce development</option>
                      <option value="website">Business website development</option>
                      <option value="software">Software / subscription service</option>
                      <option value="product">Bangladesh product selling</option>
                    </select>
                  </Field>
                )}
                <Field label="Offer / project name">
                  <input
                    required
                    value={brief.name}
                    onChange={(event) => setBrief({ ...brief, name: event.target.value })}
                    placeholder="Custom ecommerce development for small businesses"
                  />
                </Field>
                <Field label="Offer type">
                  <select
                    value={brief.kind}
                    onChange={(event) => setBrief({ ...brief, kind: event.target.value })}
                  >
                    <option value="service">Service / client project</option>
                    <option value="software">Software / digital application</option>
                    <option value="physical-product">Physical product research</option>
                  </select>
                </Field>
                {brief.kind === 'physical-product' && (
                  <Field
                    label="Linked product"
                    hint="Link real product costs and media to this research. Approve Bangladesh to use the product sales engine."
                  >
                    <select
                      value={brief.productId || ''}
                      onChange={(event) => {
                        const product = data.products.find(
                          (item) => item.id === event.target.value,
                        );
                        setBrief({
                          ...brief,
                          productId: product?.id || null,
                          ...(product
                            ? { name: product.name, description: product.description }
                            : {}),
                        });
                      }}
                    >
                      <option value="">Research only / choose a saved product</option>
                      {data.products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label="What do you sell, and what problem does it solve?">
                  <textarea
                    required
                    value={brief.description}
                    onChange={(event) => setBrief({ ...brief, description: event.target.value })}
                  />
                </Field>
                <Field label="Who should buy it?">
                  <textarea
                    required
                    value={brief.buyerProfile}
                    onChange={(event) => setBrief({ ...brief, buyerProfile: event.target.value })}
                    placeholder="Retail business owners who need a custom online store"
                  />
                </Field>
                <Field label="Countries to compare (up to 10)">
                  <input
                    aria-label="Search countries"
                    placeholder="Search countries by name or code"
                    value={countryQuery}
                    onChange={(event) => setCountryQuery(event.target.value)}
                  />
                  <div className="country-options">
                    {[
                      ...new Set([
                        ...brief.candidateCountries,
                        ...Object.entries(Countries)
                          .filter(([code, name]) =>
                            `${code} ${name}`.toLowerCase().includes(countryQuery.toLowerCase()),
                          )
                          .slice(0, 32)
                          .map(([code]) => code),
                      ]),
                    ].map((code) => (
                      <label key={code}>
                        <input
                          type="checkbox"
                          checked={brief.candidateCountries.includes(code)}
                          disabled={
                            !brief.candidateCountries.includes(code) &&
                            brief.candidateCountries.length >= 10
                          }
                          onChange={(event) =>
                            setBrief({
                              ...brief,
                              candidateCountries: event.target.checked
                                ? [...brief.candidateCountries, code]
                                : brief.candidateCountries.filter((value) => value !== code),
                              candidateLocationIds: (brief.candidateLocationIds || []).filter(
                                (id) =>
                                  event.target.checked ||
                                  locations.find((row) => row.id === id)?.country !== code,
                              ),
                            })
                          }
                        />
                        {Countries[code]}
                      </label>
                    ))}
                  </div>
                </Field>
                <RegionPicker
                  countries={brief.candidateCountries}
                  countryNames={Countries}
                  selected={brief.candidateLocationIds || []}
                  locations={locations}
                  onLocations={mergeLocations}
                  onChange={(candidateLocationIds) => setBrief({ ...brief, candidateLocationIds })}
                  api={api}
                  run={run}
                  busy={busy}
                />
                <Field label="Questions and constraints">
                  <textarea
                    value={brief.questions}
                    onChange={(event) => setBrief({ ...brief, questions: event.target.value })}
                    placeholder="Compare buyer readiness, competition, sales cycle, language and how we should validate demand."
                  />
                </Field>
                <EvidenceInputs brief={brief} setBrief={setBrief} />
                <button
                  className="button primary"
                  disabled={busy || !brief.candidateCountries.length}
                >
                  <Save size={16} />
                  Save research brief
                </button>
                {project && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setBriefEditing(false)}
                  >
                    Cancel
                  </button>
                )}
              </form>
            </article>
          ) : (
            <>
              <article className="panel tools-panel">
                <div className="tools-row">
                  <div>
                    <span className="eyebrow">{project.kind.toUpperCase()}</span>
                    <h2>{project.name}</h2>
                  </div>
                  <button className="button secondary" onClick={() => setBriefEditing(true)}>
                    Edit brief & evidence
                  </button>
                </div>
                <p>{project.description}</p>
                <p className="small muted">
                  Candidate markets:{' '}
                  {project.candidateCountries.map((code) => Countries[code]).join(', ')}
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(async () => {
                      await api(`/research/${project.id}/run`, 'POST', { instruction: followup });
                      setFollowup('');
                      await reload(project.id);
                    }, 'New research version created. Earlier decisions are kept in history.');
                  }}
                >
                  <Field label={version ? 'Discuss / research further' : 'First research question'}>
                    <textarea
                      value={followup}
                      onChange={(event) => setFollowup(event.target.value)}
                      placeholder="Compare US and UK specifically for custom ecommerce clients. What evidence would change the recommendation?"
                    />
                  </Field>
                  <button className="button primary" disabled={busy}>
                    <RefreshCw size={16} />
                    {version ? 'Research again with this question' : 'Run country research'}
                  </button>
                </form>
              </article>
              {versions.length > 0 && (
                <div className="version-toolbar">
                  <strong>Version history</strong>
                  <select
                    aria-label="Research version"
                    value={versionId}
                    onChange={(event) => {
                      setVersionId(event.target.value);
                      setEditing(false);
                      setCampaign(false);
                    }}
                  >
                    {[...versions].reverse().map((item) => (
                      <option key={item.id} value={item.id}>
                        Version {item.number} · {item.status} ·{' '}
                        {new Date(item.createdAt).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {version && (
                <>
                  <article className="panel tools-panel">
                    <div className="tools-row">
                      <h2>Research version {version.number}</h2>
                      <span className="badge">{version.status}</span>
                    </div>
                    <p className="small muted">{version.instruction}</p>
                    <p>{version.report.summary}</p>
                    <ResearchRetrieval retrieval={version.report.retrieval} />
                    <div className="notice">
                      AI findings are hypotheses with low confidence. No reliable CPC, demand score
                      or acquisition forecast is invented.
                    </div>
                  </article>
                  <div className="country-comparisons">
                    {version.report.countries.map((market) => (
                      <article className="panel tools-panel" key={market.country}>
                        <h2>
                          <Globe size={20} /> {Countries[market.country]}
                        </h2>
                        <p>{market.opportunity}</p>
                        <h3>Buyer segments</h3>
                        <ul>
                          {market.buyerSegments.map((text, index) => (
                            <li key={index}>{text}</li>
                          ))}
                        </ul>
                        <h3>Competition</h3>
                        <p>{market.competition}</p>
                        <h3>Advantages to test</h3>
                        <ul>
                          {market.advantages.map((text, index) => (
                            <li key={index}>{text}</li>
                          ))}
                        </ul>
                        <h3>Risks & barriers</h3>
                        <ul>
                          {market.risks.map((text, index) => (
                            <li key={index}>{text}</li>
                          ))}
                        </ul>
                        <h3>Test approach</h3>
                        <p>{market.testApproach}</p>
                        <small>
                          Languages: {market.languages.join(', ')} · Confidence: {market.confidence}
                        </small>
                      </article>
                    ))}
                  </div>
                  {(version.report.regions || []).length > 0 && (
                    <article className="panel tools-panel">
                      <h2>State & region comparison</h2>
                      {version.report.regions.map((region) => {
                        const location = locations.find((row) => row.id === region.locationId);
                        return (
                          <section className="research-evidence" key={region.locationId}>
                            <h3>
                              {location?.name || region.locationId} · {Countries[location?.country]}
                            </h3>
                            <p>{region.opportunity}</p>
                            <h3>Buyer segments</h3>
                            <ul>
                              {region.buyerSegments.map((text, index) => (
                                <li key={index}>{text}</li>
                              ))}
                            </ul>
                            <h3>Competition</h3>
                            <p>{region.competition}</p>
                            <h3>Risks & barriers</h3>
                            <ul>
                              {region.barriers.map((text, index) => (
                                <li key={index}>{text}</li>
                              ))}
                            </ul>
                            <h3>Test approach</h3>
                            <p>{region.testApproach}</p>
                            <h3>Evidence gaps</h3>
                            <ul>
                              {region.evidenceGaps.map((text, index) => (
                                <li key={index}>{text}</li>
                              ))}
                            </ul>
                          </section>
                        );
                      })}
                    </article>
                  )}
                  <article className="panel tools-panel">
                    <h2>Evidence & open questions</h2>
                    {version.report.findings.map((finding, index) => (
                      <div className="research-evidence" key={index}>
                        <strong>{finding.subject}</strong>
                        <p>{finding.finding}</p>
                        <small>
                          {finding.quality} · {new Date(finding.observedAt).toLocaleString()} ·{' '}
                          {finding.source.startsWith('https://') ? (
                            <a href={finding.source} target="_blank" rel="noreferrer">
                              Open source
                            </a>
                          ) : (
                            finding.source
                          )}
                        </small>
                      </div>
                    ))}
                    <ul>
                      {version.report.openQuestions.map((question, index) => (
                        <li key={index}>{question}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="panel tools-panel">
                    <h2>Your test-market decision</h2>
                    {current && !version.report.recommendation.country && (
                      <p className="notice" id="research-review-guidance">
                        No country is selected. Choose a test country and explain your decision,
                        save a new version, then request review. You can also continue researching.
                      </p>
                    )}
                    {editing ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          run(async () => {
                            await api(`/research/versions/${version.id}/edit`, 'POST', {
                              summary: decision.summary,
                              recommendation: {
                                ...version.report.recommendation,
                                country: decision.country || null,
                                locationIds: decision.locationIds || [],
                                reason: decision.reason,
                              },
                              note: decision.note,
                            });
                            await reload(project.id);
                          }, 'Decision edited in a new version. It needs a new review.');
                        }}
                      >
                        <Field label="Research summary">
                          <textarea
                            required
                            value={decision.summary}
                            onChange={(event) =>
                              setDecision({ ...decision, summary: event.target.value })
                            }
                          />
                        </Field>
                        <Field label="Test country">
                          <select
                            autoFocus={!decision.country}
                            value={decision.country}
                            onChange={(event) =>
                              setDecision({
                                ...decision,
                                country: event.target.value,
                                locationIds: [],
                              })
                            }
                          >
                            <option value="">Evidence is not sufficient yet</option>
                            {project.candidateCountries.map((code) => (
                              <option key={code} value={code}>
                                {Countries[code]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {(project.candidateLocationIds || []).length > 0 && (
                          <section className="region-picker">
                            <h3>Approved targeting areas</h3>
                            <p>
                              Choose researched areas within the selected country. Leave all
                              unchecked for the whole country. Selected areas share one ad set and
                              one budget.
                            </p>
                            <div className="country-options">
                              {locations
                                .filter(
                                  (location) =>
                                    project.candidateLocationIds.includes(location.id) &&
                                    location.country === decision.country,
                                )
                                .map((location) => (
                                  <label key={location.id}>
                                    <input
                                      type="checkbox"
                                      aria-label={`Target ${location.name}`}
                                      checked={(decision.locationIds || []).includes(location.id)}
                                      onChange={(event) =>
                                        setDecision({
                                          ...decision,
                                          locationIds: event.target.checked
                                            ? [...(decision.locationIds || []), location.id]
                                            : (decision.locationIds || []).filter(
                                                (id) => id !== location.id,
                                              ),
                                        })
                                      }
                                    />
                                    {location.name}
                                  </label>
                                ))}
                            </div>
                          </section>
                        )}
                        <Field label="Why this country / what remains uncertain?">
                          <textarea
                            required
                            value={decision.reason}
                            onChange={(event) =>
                              setDecision({ ...decision, reason: event.target.value })
                            }
                          />
                        </Field>
                        <Field label="Reason for this edit">
                          <textarea
                            required
                            minLength={5}
                            value={decision.note}
                            onChange={(event) =>
                              setDecision({ ...decision, note: event.target.value })
                            }
                          />
                        </Field>
                        <button className="button primary" disabled={busy}>
                          Save new decision version
                        </button>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy}
                          onClick={() => setEditing(false)}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <>
                        <h3>
                          {version.report.recommendation.country
                            ? Countries[version.report.recommendation.country]
                            : 'No country selected yet'}
                        </h3>
                        <p>{version.report.recommendation.reason}</p>
                        {!!version.report.recommendation.locationIds?.length && (
                          <p className="notice">
                            Target areas:{' '}
                            {version.report.recommendation.locationIds
                              .map((id) => locations.find((row) => row.id === id)?.name || id)
                              .join(', ')}
                          </p>
                        )}
                        <ul>
                          {version.report.recommendation.nextSteps.map((text, index) => (
                            <li key={index}>{text}</li>
                          ))}
                        </ul>
                        <div className="tools-actions">
                          {current && (
                            <button
                              className="button secondary"
                              disabled={busy}
                              onClick={openDecisionEditor}
                            >
                              Edit decision in a new version
                            </button>
                          )}
                          {current && version.status === 'draft' && (
                            <button
                              className="button primary"
                              disabled={busy}
                              aria-describedby={
                                !version.report.recommendation.country
                                  ? 'research-review-guidance'
                                  : undefined
                              }
                              onClick={() => {
                                if (!version.report.recommendation.country) {
                                  openDecisionEditor();
                                  return;
                                }
                                run(async () => {
                                  await api(`/research/versions/${version.id}/submit`, 'POST', {});
                                  await reload(project.id);
                                }, 'Research decision submitted for human review.');
                              }}
                            >
                              Request decision review
                            </button>
                          )}
                          {current &&
                            version.status === 'pending' &&
                            canApprove &&
                            ['approve', 'reject'].map((action) => (
                              <button
                                key={action}
                                className={`button ${action === 'approve' ? 'primary' : 'secondary'}`}
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    async () => {
                                      await api(
                                        `/research/versions/${version.id}/decision`,
                                        'POST',
                                        {
                                          decision: action,
                                          comment:
                                            action === 'approve'
                                              ? 'Reviewed the country comparison, evidence limitations and selected test market.'
                                              : 'Research needs further evidence and refinement.',
                                        },
                                      );
                                      await reload(project.id);
                                    },
                                    `Research ${action === 'approve' ? 'approved' : 'rejected'}.`,
                                  )
                                }
                              >
                                {action === 'approve'
                                  ? 'Approve research decision'
                                  : 'Reject & research further'}
                              </button>
                            ))}
                          {current &&
                            version.status === 'approved' &&
                            project.kind !== 'physical-product' && (
                              <button
                                className="button primary"
                                onClick={() => setCampaign(!campaign)}
                              >
                                <ArrowRight size={16} />
                                Prepare campaign draft
                              </button>
                            )}
                          {current &&
                            version.status === 'approved' &&
                            project.kind === 'physical-product' && (
                              <button
                                className="button primary"
                                disabled={
                                  busy ||
                                  !project.productId ||
                                  version.report.recommendation.country !== 'BD'
                                }
                                onClick={() =>
                                  run(async () => {
                                    const plan = await api(
                                      `/research/versions/${version.id}/product-campaign`,
                                      'POST',
                                      {},
                                    );
                                    await refresh();
                                    onPlan(plan);
                                  }, 'Product campaign draft created from the approved research decision.')
                                }
                              >
                                Create Bangladesh product campaign draft
                              </button>
                            )}
                        </div>
                        {version.reviewComment && (
                          <p className="small muted">Review: {version.reviewComment}</p>
                        )}
                        {!current && (
                          <div className="notice">
                            This is a historical version. Select the latest version to edit, approve
                            or create a campaign.
                          </div>
                        )}
                      </>
                    )}
                  </article>
                  {campaign && current && version.status === 'approved' && (
                    <CampaignSetup
                      key={version.id}
                      data={data}
                      project={project}
                      version={version}
                      countryName={Countries[version.report.recommendation.country]}
                      targetNames={(version.report.recommendation.locationIds || []).map(
                        (id) => locations.find((row) => row.id === id)?.name || id,
                      )}
                      fields={campaignFields}
                      setFields={setCampaignFields}
                      api={api}
                      run={run}
                      busy={busy}
                      media={media}
                      refresh={refresh}
                      onPlan={onPlan}
                    >
                      <MediaPicker
                        api={api}
                        value={media.mediaAssetId}
                        thumbnail={media.thumbnailAssetId}
                        onChange={(mediaAssetId, thumbnailAssetId) =>
                          setMedia({ mediaAssetId, thumbnailAssetId })
                        }
                      />
                    </CampaignSetup>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
function EvidenceInputs({ brief, setBrief }) {
  const [input, setInput] = useState({
    subject: '',
    finding: '',
    source: '',
    observedAt: new Date().toISOString().slice(0, 16),
  });
  return (
    <div className="brief-evidence">
      <h3>Dated evidence (optional)</h3>
      <p>
        Supply real competitor pages, market observations or buyer interviews to guide research.
      </p>
      {brief.evidence.map((item, index) => (
        <div key={index} className="tools-row">
          <span>
            {item.subject} · {item.source}
          </span>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              setBrief({ ...brief, evidence: brief.evidence.filter((_, i) => i !== index) })
            }
          >
            Remove
          </button>
        </div>
      ))}
      <div className="form-grid">
        <Field label="Evidence subject">
          <input
            value={input.subject}
            onChange={(event) => setInput({ ...input, subject: event.target.value })}
          />
        </Field>
        <Field label="Source HTTPS URL or user-input">
          <input
            value={input.source}
            onChange={(event) => setInput({ ...input, source: event.target.value })}
            placeholder="https://... or user-input"
          />
        </Field>
      </div>
      <Field label="What did you actually observe?">
        <textarea
          value={input.finding}
          onChange={(event) => setInput({ ...input, finding: event.target.value })}
        />
      </Field>
      <Field label="Observation date">
        <input
          type="datetime-local"
          value={input.observedAt}
          onChange={(event) => setInput({ ...input, observedAt: event.target.value })}
        />
      </Field>
      <button
        type="button"
        className="button secondary"
        disabled={
          !input.subject ||
          input.finding.length < 5 ||
          !input.source ||
          !input.observedAt ||
          brief.evidence.length >= 30
        }
        onClick={() => {
          setBrief({
            ...brief,
            evidence: [
              ...brief.evidence,
              {
                ...input,
                observedAt: new Date(input.observedAt).toISOString(),
                confidence: 'Medium',
                classification: 'observed',
                quality: 'Estimated data',
              },
            ],
          });
          setInput({ ...input, subject: '', finding: '', source: '' });
        }}
      >
        Add observation to brief
      </button>
    </div>
  );
}

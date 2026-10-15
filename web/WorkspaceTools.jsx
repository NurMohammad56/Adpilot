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
import { ConfidenceNotes } from './ConfidenceNotes.jsx';
import { ResearchReadiness } from './ResearchReadiness.jsx';
import { StatusRemark } from './StatusRemark.jsx';
import { Pagination, usePagination } from './Pagination.jsx';
import { TrendSourceHub } from './ProductDiscovery.jsx';
import { AdLibraryResearchSources } from './AdLibraryResearch.jsx';
import { AdLibraryPicker } from './AdLibraryPicker.jsx';
import { ResearchEvidenceWorkbench, ResearchReuseNote, MarketSample } from './ResearchEvidence.jsx';
import { useReportTranslation, ReportTranslationNotice } from './ReportTranslation.jsx';
import { useDraft } from './use-draft.js';
import { getLanguage } from './i18n.js';
import { uploadMedia } from './api.js';
import { MediaPicker } from './MediaPicker.jsx';
import { ResearchEstimate } from './OperationsPanel.jsx';
export { MediaPicker } from './MediaPicker.jsx';
import { CampaignSetup } from './CampaignSetup.jsx';
import { CampaignField } from './FieldHelp.jsx';
import { RegionPicker } from './RegionPicker.jsx';
import { DeleteRecord } from './DeleteRecord.jsx';
import { ServiceAssessment } from './ServiceAssessment.jsx';
import {
  ProductResearchFields,
  ProductFacts,
  productResearchGoals,
} from './ProductResearchFields.jsx';
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
export function MediaLibrary({ data, api, run, busy }) {
  const [assets, setAssets] = useState([]);
  const [loadError, setLoadError] = useState('');
  const pagination = usePagination(assets, { pageSize: 12, resetKey: data.business.id });
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
        {pagination.items.map((asset) => (
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
            <div className="record-actions">
              <DeleteRecord kind="media" id={asset.id} name={asset.name} onDeleted={load} />
            </div>
          </article>
        ))}
      </div>
      <Pagination pagination={pagination} label="Media library" sizes={[12, 24, 48]} />
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
  serviceProfileId: null,
  researchMode: 'market-comparison',
  adLibraryIds: [],
};
export function ResearchDesk({
  data,
  api,
  run,
  busy,
  refresh,
  onPlan,
  onOpenLibrary,
  onOpenDiscovery,
  showProduct,
  mode = 'digital',
  serviceProfile = null,
  initialProjectId = null,
  onEditService,
}) {
  const physical = mode === 'product';
  const focused = mode === 'service';
  const [serviceProfiles, setServiceProfiles] = useState([]);
  const [comparisonProfileId, setComparisonProfileId] = useDraft(
    `adpilot-service-comparison:${data.business.id}:${data.user.id}`,
    '',
  );
  const comparisonProfile =
    !focused && !physical ? serviceProfiles.find((row) => row.id === comparisonProfileId) : null;
  const [freshResearch, setFreshResearch] = useState(false);
  const defaults = physical
    ? {
        ...emptyBrief,
        kind: 'physical-product',
        candidateCountries: ['BD'],
        productCategory: '',
        researchGoal: 'business-decision',
      }
    : emptyBrief;
  const selectionKey = focused
    ? `adpilot-service-workspace:${data.business.id}:${serviceProfile.id}`
    : `adpilot-${physical ? 'product-research' : 'research'}-selection:${data.business.id}`;
  const [locations, setLocations] = useState([]);
  const [countryQuery, setCountryQuery] = useState('');
  const mergeLocations = (rows) =>
    setLocations((current) => [
      ...current.filter((row) => !rows.some((next) => next.id === row.id)),
      ...rows,
    ]);
  const [projects, setProjects] = useState([]);
  const projectPagination = usePagination(projects, {
    pageSize: 8,
    resetKey: `${data.business.id}:${mode}`,
  });
  const [project, setProject] = useState(null);
  const [briefDrafts, setBriefDrafts] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:${physical ? 'product' : 'research'}-briefs`,
    { new: defaults },
  );
  const briefKey =
    project?.id ||
    (comparisonProfile ? `profile-${comparisonProfile.id}-${comparisonProfile.revision}` : 'new');
  const savedBrief =
    briefDrafts[briefKey] ||
    (project
      ? Object.fromEntries(Object.keys(defaults).map((key) => [key, project[key] ?? defaults[key]]))
      : comparisonProfile
        ? {
            ...defaults,
            name: comparisonProfile.name,
            kind: comparisonProfile.kind,
            description: comparisonProfile.description,
            buyerProfile: comparisonProfile.buyerProfile,
            candidateCountries: [comparisonProfile.country],
            evidence: comparisonProfile.evidence,
            adLibraryIds: comparisonProfile.adLibraryIds,
            serviceProfileId: comparisonProfile.id,
            researchMode: 'market-comparison',
          }
        : defaults);
  const compatibleBrief = (
    physical ? savedBrief.kind !== 'physical-product' : savedBrief.kind === 'physical-product'
  )
    ? defaults
    : savedBrief;
  const brief = { ...defaults, ...compatibleBrief };
  const existingProductBrief =
    physical && !project && brief.productId
      ? projects.find((item) => item.productId === brief.productId)
      : null;
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
    {
      mediaAssetId: serviceProfile?.mediaAssetId || null,
      thumbnailAssetId: serviceProfile?.thumbnailAssetId || null,
    },
  );
  const [campaignFields, setCampaignFields] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:campaign:${versionId}`,
    {
      goal: serviceProfile?.goal || 'leads',
      landingUrl: serviceProfile?.landingUrl || '',
      price:
        serviceProfile?.currency === (data.integration.currency || 'BDT')
          ? (serviceProfile?.price ?? '')
          : '',
      deliveryCost:
        serviceProfile?.currency === (data.integration.currency || 'BDT')
          ? (serviceProfile?.deliveryCost ?? '')
          : '',
      requiredProfit:
        serviceProfile?.currency === (data.integration.currency || 'BDT')
          ? (serviceProfile?.requiredProfit ?? '')
          : '',
      leadCloseRate: serviceProfile?.leadCloseRate ? serviceProfile.leadCloseRate * 100 : '',
      dailyBudget: '',
      durationDays: '7',
      testBudgetCeiling: '',
      budgetPreference: 'starter',
      manualCeiling: false,
      budgetCurrency: data.integration.currency || 'BDT',
      economicsMode:
        serviceProfile?.currency === (data.integration.currency || 'BDT') &&
        serviceProfile?.price != null &&
        serviceProfile?.deliveryCost != null &&
        serviceProfile?.requiredProfit != null
          ? 'known'
          : 'unknown',
      economicsCurrency: data.integration.currency || 'BDT',
      acknowledgeUnknownCPA: false,
    },
  );
  const loadProjects = async () => {
    setLocations(await api('/research/locations'));
    const values = (await api('/research')).filter((item) =>
      focused
        ? item.serviceProfileId === serviceProfile.id &&
          item.researchMode === 'single-country-service'
        : physical
          ? item.kind === 'physical-product'
          : item.kind !== 'physical-product' && item.researchMode !== 'single-country-service',
    );
    setProjects(values);
    return values;
  };
  useEffect(() => {
    const currency = data.integration.currency || 'BDT';
    setCampaignFields((current) => ({
      ...current,
      economicsCurrency: currency,
      ...((current.economicsCurrency || current.budgetCurrency || currency) !== currency
        ? { price: '', deliveryCost: '', requiredProfit: '', economicsMode: 'unknown' }
        : {}),
    }));
  }, [data.integration.currency, versionId]);
  useEffect(() => {
    loadProjects()
      .then((values) => {
        const saved = initialProjectId || sessionStorage.getItem(selectionKey);
        const selected = values.find((item) => item.id === saved);
        if (selected) return select(selected);
      })
      .catch((error) =>
        run(() => {
          throw error;
        }),
      );
  }, [data.business.id, initialProjectId]);
  useEffect(() => {
    if (!physical && !focused)
      api('/services')
        .then(setServiceProfiles)
        .catch((error) =>
          run(() => {
            throw error;
          }),
        );
  }, [data.business.id, focused, physical]);
  async function select(selected) {
    setProject(selected);
    sessionStorage.setItem(selectionKey, selected.id);
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
  useEffect(() => {
    const latest = data.researchProjects.find((item) => item.id === project?.id);
    const completed = data.jobs?.find(
      (job) =>
        job.type === 'research-task' &&
        job.targetId === project?.id &&
        job.status === 'completed' &&
        job.versionId &&
        job.versionId !== project?.currentVersionId,
    );
    if (project && ((latest && latest.currentVersionId !== project.currentVersionId) || completed))
      reload(project.id).catch((error) =>
        run(() => {
          throw error;
        }),
      );
  }, [data.researchProjects, data.jobs]);
  const translation = useReportTranslation(
    'research',
    version?.id,
    version?.report,
    data.business.id,
  );
  const displayReport = translation.report;
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
        serviceDecision: version.report.serviceAssessment?.decision || 'hold',
      });
    setEditing(true);
  }
  return (
    <>
      <Heading
        title={
          focused ? 'Service country workspace' : physical ? 'Product research' : 'Service research'
        }
      >
        {physical
          ? 'Validate physical product demand, suppliers and delivery before planning a campaign.'
          : focused
            ? 'One saved service, one country: evaluate buyers, positioning, competitors and a small campaign test.'
            : 'For digital services and software: compare client markets, investigate buyer needs and refine your offer.'}{' '}
        Research approval and campaign launch approval are separate.
      </Heading>
      <div className={`research-layout ${focused ? 'service-workspace' : ''}`}>
        {!focused && (
          <aside className="panel tools-panel research-projects">
            {physical && (
              <button className="button primary full" onClick={onOpenDiscovery}>
                Discover product opportunities
              </button>
            )}
            <button
              className="button secondary full"
              onClick={() => {
                sessionStorage.removeItem(selectionKey);
                setProject(null);
                setComparisonProfileId('');
                setBriefDrafts((current) => ({ ...current, new: defaults }));
                setVersions([]);
                setBriefEditing(false);
              }}
            >
              <Plus size={16} />
              {physical ? 'New product research' : 'New research brief'}
            </button>
            {projectPagination.items.map((item) => (
              <div key={item.id} className="research-record-item">
                <button
                  className={`research-project ${project?.id === item.id ? 'selected' : ''}`}
                  disabled={busy}
                  onClick={() => run(() => select(item))}
                >
                  <strong>{item.name}</strong>
                  <small>
                    {item.kind} · {item.status} · {item.candidateCountries.join(', ')}
                  </small>
                </button>
                <DeleteRecord
                  compact
                  kind="research"
                  id={item.id}
                  name={item.name}
                  onDeleted={async () => {
                    await loadProjects();
                    if (project?.id === item.id) {
                      sessionStorage.removeItem(selectionKey);
                      setProject(null);
                      setVersions([]);
                      setVersionId('');
                      setEditing(false);
                      setCampaign(false);
                      setBriefEditing(false);
                    }
                  }}
                />
              </div>
            ))}
            <Pagination
              pagination={projectPagination}
              label={physical ? 'Product research briefs' : 'Digital research briefs'}
              sizes={[8, 16, 32]}
            />
          </aside>
        )}
        <section className="research-main">
          {focused && (
            <div className="notice">
              <strong>
                {serviceProfile.name} · {Countries[serviceProfile.country]}
              </strong>
              <p>
                Service facts are saved in your profile. Opening this workspace reuses its existing
                report; a new research run is your choice.
              </p>
              <button className="button secondary" onClick={onEditService}>
                Edit service profile
              </button>
              {serviceProfile.currency !== (data.integration.currency || 'BDT') && (
                <p>
                  Service prices and ad account currency differ. Enter campaign economics in the ad
                  account currency; no conversion is assumed.
                </p>
              )}
            </div>
          )}
          {project && (
            <ProductFacts
              product={
                physical && !briefEditing
                  ? data.products.find((item) => item.id === project.productId)
                  : null
              }
              onEdit={showProduct}
            />
          )}
          {project && (
            <ResearchEvidenceWorkbench
              data={data}
              api={api}
              run={run}
              busy={busy}
              keyword={project.name}
              country={
                project.candidateCountries.length === 1 ? project.candidateCountries[0] : 'ALL'
              }
              projectId={project.id}
              onOpenLibrary={onOpenLibrary}
              refreshKey={`${project.revision}:${version?.id || ''}`}
            />
          )}
          {focused && !project ? (
            <p role="status">Loading saved service research…</p>
          ) : !project || briefEditing ? (
            <article className="panel tools-panel">
              <h2>
                {physical
                  ? project
                    ? 'Edit product research details'
                    : 'Which product should we validate?'
                  : project
                    ? 'Edit research brief'
                    : 'What would you like to research?'}
              </h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  run(
                    async () => {
                      const input =
                        physical && !brief.buyerProfile.trim()
                          ? {
                              ...brief,
                              buyerProfile: `Buyer hypothesis not yet validated: people considering ${brief.name}. Identify actual buyer needs and segments in the selected markets.`,
                            }
                          : brief;
                      let saved;
                      if (physical && !project && brief.productId) {
                        const linked = await api(
                          `/products/${brief.productId}/research-brief`,
                          'POST',
                          {},
                        );
                        if (linked.reused) {
                          await loadProjects();
                          await select(linked.project);
                          return;
                        }
                        const evidence = [
                          ...new Map(
                            [...(input.evidence || []), ...(linked.project.evidence || [])].map(
                              (item) => [
                                JSON.stringify([
                                  item.source,
                                  item.subject,
                                  item.finding,
                                  item.observedAt,
                                ]),
                                item,
                              ],
                            ),
                          ).values(),
                        ].slice(0, 30);
                        saved = await api(`/research/${linked.project.id}`, 'PUT', {
                          ...input,
                          evidence,
                        });
                      } else {
                        saved = await api(
                          project ? `/research/${project.id}` : '/research',
                          project ? 'PUT' : 'POST',
                          input,
                        );
                      }
                      setBriefDrafts((current) => {
                        const updated = { ...current };
                        delete updated[briefKey];
                        return updated;
                      });
                      await loadProjects();
                      await select(saved);
                    },
                    physical
                      ? 'Product research ready. Review the details, then validate your selected question.'
                      : 'Brief saved. Run research or add a focused question.',
                  );
                }}
              >
                {!physical && !project && (
                  <Field
                    label="Start from a saved service"
                    hint="Service facts and evidence are reused. Select the countries you want to compare below."
                  >
                    <select
                      value={comparisonProfileId}
                      onChange={(event) => setComparisonProfileId(event.target.value)}
                    >
                      <option value="">Write a separate research brief</option>
                      {serviceProfiles.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                {!project && !physical && (
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
                          other: {
                            kind: 'service',
                            name: '',
                            description: '',
                            buyerProfile: '',
                            candidateCountries: brief.candidateCountries,
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
                      <option value="other">Other digital service / custom offer</option>
                    </select>
                  </Field>
                )}
                {physical ? (
                  <ProductResearchFields
                    brief={brief}
                    setBrief={setBrief}
                    products={data.products}
                    projects={projects}
                    project={project}
                    onEditProduct={showProduct}
                    onOpenExisting={(existing) =>
                      run(
                        () => select(existing),
                        'Existing product research opened. Saved reports and evidence are reused.',
                      )
                    }
                  />
                ) : (
                  <>
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
                      </select>
                    </Field>
                    <Field label="What do you sell, and what problem does it solve?">
                      <textarea
                        required
                        value={brief.description}
                        onChange={(event) =>
                          setBrief({ ...brief, description: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Who should buy it?">
                      <textarea
                        required
                        value={brief.buyerProfile}
                        onChange={(event) =>
                          setBrief({ ...brief, buyerProfile: event.target.value })
                        }
                        placeholder="Retail business owners who need a custom online store"
                      />
                    </Field>
                  </>
                )}
                <Field
                  label={
                    physical
                      ? 'Markets to investigate (up to 10)'
                      : 'Countries to compare (up to 10)'
                  }
                >
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
                <Field
                  label={physical ? 'Product questions and limits' : 'Questions and constraints'}
                >
                  <textarea
                    value={brief.questions}
                    onChange={(event) => setBrief({ ...brief, questions: event.target.value })}
                    placeholder={
                      physical
                        ? 'Compare actual competitor prices and delivery terms, product quality, COD returns, buyer needs and the cheapest useful test.'
                        : 'Compare buyer readiness, competition, sales cycle, language and how we should validate demand.'
                    }
                  />
                </Field>
                <EvidenceInputs brief={brief} setBrief={setBrief} />
                <AdLibraryPicker
                  businessId={data.business.id}
                  productId={brief.productId}
                  projectId={project?.id}
                  selected={brief.adLibraryIds || []}
                  onChange={(adLibraryIds) => setBrief({ ...brief, adLibraryIds })}
                  onOpenLibrary={onOpenLibrary}
                  busy={busy}
                />
                <button
                  className="button primary"
                  disabled={
                    busy || !brief.candidateCountries.length || Boolean(existingProductBrief)
                  }
                >
                  <Save size={16} />
                  {physical ? 'Save product research' : 'Save research brief'}
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
              <StatusRemark
                value={
                  version?.adLibraryInvalidatedAt || version?.serviceProfileInvalidatedAt
                    ? 'needs_research'
                    : version?.status ||
                      (project.status === 'draft' ? 'brief_ready' : project.status)
                }
              />
              <article className="panel tools-panel">
                <div className="tools-row">
                  <div>
                    <span className="eyebrow">{project.kind.toUpperCase()}</span>
                    <h2>{project.name}</h2>
                    {physical && (
                      <small>
                        {
                          productResearchGoals.find(
                            ([key]) => key === (project.researchGoal || 'business-decision'),
                          )?.[1]
                        }
                      </small>
                    )}
                  </div>
                  {!focused && (
                    <button className="button secondary" onClick={() => setBriefEditing(true)}>
                      Edit brief & evidence
                    </button>
                  )}
                  <button className="button secondary" type="button" onClick={onOpenLibrary}>
                    Ad Library research
                  </button>
                </div>
                <p>{project.description}</p>
                <AdLibraryPicker
                  businessId={data.business.id}
                  productId={project.productId}
                  projectId={project.id}
                  selected={project.adLibraryIds || []}
                  onChange={(adLibraryIds) =>
                    run(async () => {
                      const input = Object.fromEntries(
                        Object.keys(defaults).map((key) => [
                          key,
                          key === 'adLibraryIds' ? adLibraryIds : (project[key] ?? defaults[key]),
                        ]),
                      );
                      if (project.serviceProfileId) {
                        input.serviceProfileId = project.serviceProfileId;
                        input.researchMode = project.researchMode;
                      }
                      await api(`/research/${project.id}`, 'PUT', input);
                      await reload(project.id);
                    }, 'Competitor ads updated. Run research again and request a fresh review.')
                  }
                  onOpenLibrary={onOpenLibrary}
                  busy={busy}
                />
                <p className="small muted">
                  Candidate markets:{' '}
                  {project.candidateCountries.map((code) => Countries[code]).join(', ')}
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    run(async () => {
                      await api(`/research/${project.id}/run`, 'POST', {
                        instruction: followup,
                        fresh: freshResearch,
                      });
                      setFreshResearch(false);
                      setFollowup('');
                      await reload(project.id);
                    }, 'Research request accepted. Earlier decisions are kept in history.');
                  }}
                >
                  <Field label={version ? 'Discuss / research further' : 'First research question'}>
                    <textarea
                      id="research-followup"
                      value={followup}
                      onChange={(event) => setFollowup(event.target.value)}
                      placeholder={
                        physical
                          ? 'Do the saved competitor offers match my product quality and delivery terms? What price and COD risks should I validate before a small sales test?'
                          : focused
                            ? 'Which buyers need this exact service in the selected country? Which alternatives, trust barriers and evidence should change the decision?'
                            : 'Compare US and UK specifically for custom ecommerce clients. What evidence would change the recommendation?'
                      }
                    />
                  </Field>
                  <ResearchEstimate id={project.id} run={run} busy={busy} />
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={freshResearch}
                      onChange={(e) => setFreshResearch(e.target.checked)}
                    />
                    Fresh source check (skip saved research cache)
                  </label>
                  <p className="small muted">
                    Unchanged input and evidence reuse saved analysis for up to 12 hours. A new
                    question, product change or evidence change triggers new research. Fresh source
                    check uses a new AI request.
                  </p>
                  <button className="button primary" disabled={busy}>
                    <RefreshCw size={16} />
                    {version
                      ? 'Research again with this question'
                      : physical
                        ? 'Validate product business potential'
                        : focused
                          ? 'Research this service in this country'
                          : 'Run country research'}
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
                  <ReportTranslationNotice translation={translation} />
                  {displayReport?.serviceAssessment && <ServiceAssessment report={displayReport} />}
                  {version.serviceProfileInvalidatedAt && (
                    <p className="notice">
                      Service facts changed. Generate a fresh report and request a new review.
                      Earlier reports stay in history.
                    </p>
                  )}
                  <ResearchReadiness
                    report={displayReport}
                    onQuestion={(question) => {
                      setFollowup(question);
                      document.querySelector('#research-followup')?.focus();
                    }}
                    onOpenLibrary={onOpenLibrary}
                  />
                  {version.adLibraryInvalidatedAt && (
                    <div className="notice">
                      <div>
                        <strong>Competitor ad evidence changed</strong>
                        <p>
                          Generate a new research version below, then request and approve a fresh
                          review. The earlier report remains in history.
                        </p>
                      </div>
                    </div>
                  )}
                  <article className="panel tools-panel">
                    <div className="tools-row">
                      <h2>Research version {version.number}</h2>
                      <span className="badge">{version.status}</span>
                      <DeleteRecord
                        kind="research-versions"
                        id={version.id}
                        name={`Research version ${version.number}`}
                        onDeleted={() => reload(project.id)}
                      />
                    </div>
                    <p className="small muted">{version.instruction}</p>
                    <p>{displayReport.summary}</p>
                    <ResearchRetrieval retrieval={displayReport.retrieval} />
                    <ResearchReuseNote report={displayReport} />
                    <MarketSample sample={displayReport.marketEvidence} />
                    <ConfidenceNotes report={displayReport} />
                    <AdLibraryResearchSources observations={displayReport.adLibraryObservations} />
                    <details className="research-source-details">
                      <summary>
                        {physical
                          ? 'Explore product demand and competitor sources'
                          : 'Explore trend and competitor sources for this offer'}
                      </summary>
                      <TrendSourceHub
                        country={project.candidateCountries[0]}
                        keyword={project.name}
                      />
                    </details>
                    <div className="notice">
                      AI findings are hypotheses with low confidence. No reliable CPC, demand score
                      or acquisition forecast is invented.
                    </div>
                  </article>
                  <div className="country-comparisons">
                    {displayReport.countries.map((market) => (
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
                  {(displayReport.regions || []).length > 0 && (
                    <article className="panel tools-panel">
                      <h2>State & region comparison</h2>
                      {displayReport.regions.map((region) => {
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
                    {displayReport.findings.map((finding, index) => (
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
                      {displayReport.openQuestions.map((question, index) => (
                        <li key={index}>{question}</li>
                      ))}
                    </ul>
                  </article>
                  <article className="panel tools-panel">
                    <h2>{focused ? 'Your service decision' : 'Your test-market decision'}</h2>
                    {current && !version.report.recommendation.country && (
                      <p className="notice" id="research-review-guidance">
                        {focused
                          ? 'The target country is saved. Research has not cleared a test yet. Add evidence, refine the offer or record an explicit bounded-test decision for review.'
                          : 'No country is selected. Choose a test country and explain your decision, save a new version, then request review. You can also continue researching.'}
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
                              ...(focused ? { serviceDecision: decision.serviceDecision } : {}),
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
                        {focused && (
                          <Field label="Service decision">
                            <select
                              value={decision.serviceDecision || 'hold'}
                              onChange={(event) =>
                                setDecision({
                                  ...decision,
                                  serviceDecision: event.target.value,
                                  country:
                                    event.target.value === 'hold' ? '' : serviceProfile.country,
                                })
                              }
                            >
                              <option value="hold">Hold - collect more evidence</option>
                              <option value="revise">Revise the offer</option>
                              <option value="test">Allow a capped validation test</option>
                            </select>
                          </Field>
                        )}
                        {!focused && (
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
                        )}
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
                            : focused
                              ? 'Not cleared for a test yet'
                              : 'No country selected yet'}
                        </h3>
                        <p>{displayReport.recommendation.reason}</p>
                        {!!version.report.recommendation.locationIds?.length && (
                          <p className="notice">
                            Target areas:{' '}
                            {version.report.recommendation.locationIds
                              .map((id) => locations.find((row) => row.id === id)?.name || id)
                              .join(', ')}
                          </p>
                        )}
                        <ul>
                          {displayReport.recommendation.nextSteps.map((text, index) => (
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
                          {current &&
                            version.status === 'draft' &&
                            !version.adLibraryInvalidatedAt &&
                            !version.serviceProfileInvalidatedAt && (
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
                                    await api(
                                      `/research/versions/${version.id}/submit`,
                                      'POST',
                                      {},
                                    );
                                    await reload(project.id);
                                  }, 'Research decision submitted for human review.');
                                }}
                              >
                                Request decision review
                              </button>
                            )}
                          {current &&
                            version.status === 'pending' &&
                            !version.adLibraryInvalidatedAt &&
                            !version.serviceProfileInvalidatedAt &&
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
                            !version.adLibraryInvalidatedAt &&
                            !version.serviceProfileInvalidatedAt &&
                            project.kind !== 'physical-product' && (
                              <button
                                className="button primary"
                                disabled={Boolean(
                                  version.report.serviceAssessment &&
                                  version.report.serviceAssessment.decision !== 'test',
                                )}
                                onClick={() => setCampaign(!campaign)}
                              >
                                <ArrowRight size={16} />
                                Prepare campaign draft
                              </button>
                            )}
                          {current && project.kind === 'physical-product' && !project.productId && (
                            <button
                              type="button"
                              className="button secondary"
                              disabled={busy}
                              onClick={() =>
                                showProduct(null, {
                                  draftId: `source-research-${project.id}-`,
                                  name: project.name,
                                  category: project.productCategory || '',
                                  description: project.description,
                                  adLibraryIds: project.adLibraryIds || [],
                                  sourceContext: { kind: 'research', id: project.id },
                                  sourceLabel: project.name,
                                })
                              }
                            >
                              Add actual product from research
                            </button>
                          )}
                          {current &&
                            version.status === 'approved' &&
                            !version.adLibraryInvalidatedAt &&
                            !version.serviceProfileInvalidatedAt &&
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
                  {campaign &&
                    current &&
                    version.status === 'approved' &&
                    !version.adLibraryInvalidatedAt &&
                    !version.serviceProfileInvalidatedAt && (
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
export function EvidenceInputs({ brief, setBrief }) {
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

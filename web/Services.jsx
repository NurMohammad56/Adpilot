import React, { useEffect, useState } from 'react';
import { Plus, ArrowLeft, ArrowRight, RefreshCw } from 'lucide-react';
import { ResearchDesk, EvidenceInputs } from './WorkspaceTools.jsx';
import { CampaignField } from './FieldHelp.jsx';
import { AdLibraryPicker } from './AdLibraryPicker.jsx';
import { MediaPicker } from './MediaPicker.jsx';
import { RegionPicker } from './RegionPicker.jsx';
import { DeleteRecord } from './DeleteRecord.jsx';
import { Pagination, usePagination } from './Pagination.jsx';
import { useDraft } from './use-draft.js';
import { countryNames } from '../src/modules/research/countries.js';
import './services.css';

const empty = (currency) => ({
  name: '',
  kind: 'service',
  category: 'Custom software development',
  description: '',
  buyerProfile: '',
  deliverables: '',
  differentiation: '',
  proof: '',
  country: 'BD',
  candidateLocationIds: [],
  goal: 'leads',
  landingUrl: '',
  price: null,
  deliveryCost: null,
  requiredProfit: null,
  leadCloseRate: null,
  currency: currency || 'BDT',
  mediaAssetId: null,
  thumbnailAssetId: null,
  evidence: [],
  adLibraryIds: [],
});
const profileInput = ({
  id,
  businessId,
  createdAt,
  updatedAt,
  createdBy,
  revision,
  research,
  ...input
}) => input;

export function Services({
  data,
  api,
  run,
  busy,
  refresh,
  onPlan,
  setPage,
  onOpenLibrary,
  showProduct,
}) {
  const [rows, setRows] = useState([]),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false),
    [editor, setEditor] = useState(null);
  const [selected, setSelected] = useDraft(
    `adpilot-service-selection:${data.business.id}:${data.user.id}`,
    '',
  );
  const [query, setQuery] = useState('');
  const load = async () => {
    try {
      const values = await api('/services');
      setRows(values);
      setError('');
      return values;
    } catch (error) {
      setError(error.message);
      throw error;
    } finally {
      setLoaded(true);
    }
  };
  useEffect(() => {
    load().catch(() => {});
  }, [data.business.id]);
  const profile = rows.find((row) => row.id === selected);
  const pagination = usePagination(
    rows.filter((row) =>
      `${row.name} ${row.category} ${row.country}`.toLowerCase().includes(query.toLowerCase()),
    ),
    { pageSize: 6, resetKey: `${data.business.id}:${query}` },
  );
  if (editor)
    return (
      <ServiceEditor
        key={editor.id || 'new'}
        value={editor.id ? profileInput(editor) : empty(data.integration.currency)}
        data={data}
        api={api}
        run={run}
        busy={busy}
        onCancel={() => setEditor(null)}
        onSave={(input) =>
          run(async () => {
            const saved = await api(
              editor.id ? `/services/${editor.id}` : '/services',
              editor.id ? 'PUT' : 'POST',
              input,
            );
            await load();
            await refresh();
            setEditor(null);
            setSelected(saved.id);
            return saved;
          }, 'Service saved. Open its country workspace to research and prepare a reviewed campaign.')
        }
        draftId={editor.id || 'new'}
      />
    );
  return (
    <>
      <div className="tools-heading services-heading">
        <div>
          <span className="eyebrow">YOUR SERVICE BUSINESS</span>
          <h1>Services</h1>
          <p>
            Save your offer once. Research one target country, review the decision and prepare a
            campaign.
          </p>
        </div>
        <button className="button primary" disabled={busy} onClick={() => setEditor({})}>
          <Plus size={17} />
          Add service
        </button>
      </div>
      {error && (
        <div role="alert" className="notice">
          {error}
          <button type="button" className="button secondary" onClick={() => run(load)}>
            Retry loading services
          </button>
        </div>
      )}
      {!loaded && <p role="status">Loading services…</p>}
      {selected && !profile && loaded && (
        <div className="notice">
          The selected service is no longer available.
          <button className="button secondary" onClick={() => setSelected('')}>
            Back to services
          </button>
        </div>
      )}
      {profile ? (
        <>
          <div className="services-actions">
            <button className="button secondary" onClick={() => setSelected('')}>
              <ArrowLeft size={16} />
              Back to services
            </button>
            <button className="button secondary" disabled={busy} onClick={() => setEditor(profile)}>
              Edit service profile
            </button>
            <button
              className="button secondary"
              onClick={() => {
                sessionStorage.setItem(
                  `adpilot-service-comparison:${data.business.id}:${data.user.id}`,
                  JSON.stringify(profile.id),
                );
                sessionStorage.removeItem(`adpilot-research-selection:${data.business.id}`);
                setPage('Service research');
              }}
            >
              Compare other countries
            </button>
          </div>
          <ServiceWorkspace
            key={`${profile.id}:${profile.revision}`}
            {...{ profile, data, api, run, busy, refresh, onPlan, onOpenLibrary, showProduct }}
            onEditService={() => setEditor(profile)}
          />
        </>
      ) : (
        <>
          <div className="service-metrics">
            <div>
              <span>Saved services</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <span>Research approved</span>
              <strong>{rows.filter((row) => row.research?.status === 'approved').length}</strong>
            </div>
            <div>
              <span>Needs research or review</span>
              <strong>{rows.filter((row) => row.research?.status !== 'approved').length}</strong>
            </div>
          </div>
          <p className="notice">
            Services focuses on one saved offer and one country. Service research compares candidate
            countries. Both share evidence, version history and the campaign approval workflow.
          </p>
          <label className="field">
            <span>Find a service</span>
            <input
              aria-label="Find a service"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="services-grid">
            {pagination.items.map((row) => (
              <article className="panel tools-panel service-card" key={row.id}>
                <span className="badge">{row.research?.status || 'Not researched'}</span>
                <h2>{row.name}</h2>
                <p>
                  {row.category} · {countryNames[row.country]}
                </p>
                <p>{row.description}</p>
                <div className="services-actions">
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => setSelected(row.id)}
                  >
                    Open research & campaign
                    <ArrowRight size={16} />
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setEditor(row)}
                  >
                    Edit service
                  </button>
                  <DeleteRecord kind="services" id={row.id} name={row.name} onDeleted={load} />
                </div>
              </article>
            ))}
          </div>
          {!rows.length && loaded && (
            <div className="panel tools-panel">
              <h2>Add your first service</h2>
              <p>
                For example, custom ecommerce development for retail businesses in one target
                country. Keep unknown prices and conversion rates empty.
              </p>
              <button className="button primary" onClick={() => setEditor({})}>
                Add service
              </button>
            </div>
          )}
          <Pagination pagination={pagination} label="Services" sizes={[6, 12, 24]} />
        </>
      )}
    </>
  );
}

function ServiceWorkspace({ profile, api, ...props }) {
  const [project, setProject] = useState(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    api(`/services/${profile.id}/research-brief`, 'POST', {})
      .then((result) => {
        if (active) {
          setProject(result.project);
          setError('');
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [profile.id, profile.revision, retry]);
  if (error)
    return (
      <div role="alert" className="notice">
        {error}
        <button className="button secondary" onClick={() => setRetry((value) => value + 1)}>
          Retry opening country workspace
        </button>
      </div>
    );
  if (!project) return <p role="status">Opening saved country workspace…</p>;
  return (
    <ResearchDesk
      {...props}
      api={api}
      mode="service"
      serviceProfile={profile}
      initialProjectId={project.id}
    />
  );
}

function ServiceEditor({ value: initial, data, api, run, busy, onCancel, onSave, draftId }) {
  const [value, setValue, clear] = useDraft(
    `adpilot-service-draft:${data.business.id}:${data.user.id}:${draftId}`,
    initial,
  );
  const update = (key, next) => setValue((current) => ({ ...current, [key]: next }));
  const [locations, setLocations] = useState([]),
    [locationError, setLocationError] = useState('');
  useEffect(() => {
    api('/research/locations')
      .then(setLocations)
      .catch((error) => setLocationError(error.message));
  }, []);
  const numeric = (key, label, help, percent = false) => (
    <CampaignField label={label} help={help}>
      <input
        type="number"
        min={key === 'price' || percent ? '0.01' : '0'}
        step="any"
        max={percent ? '100' : undefined}
        value={value[key] === null ? '' : percent ? value[key] * 100 : value[key]}
        onChange={(event) =>
          update(
            key,
            event.target.value === '' ? null : Number(event.target.value) / (percent ? 100 : 1),
          )
        }
      />
    </CampaignField>
  );
  return (
    <article className="panel tools-panel service-editor">
      <div className="services-heading">
        <h1>{draftId === 'new' ? 'Add service' : 'Edit service profile'}</h1>
        <button className="button secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <p>
        Describe an offer you can actually deliver. The draft stays in this tab. Research and
        advertising start only when you request them.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (await onSave(value)) clear();
        }}
      >
        <div className="form-grid">
          <CampaignField
            label="Service name"
            help="A clear name for one offer, such as custom ecommerce development."
          >
            <input
              required
              minLength={2}
              maxLength={200}
              value={value.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </CampaignField>
          <CampaignField
            label="Service type"
            help="Choose client delivery work or your own software product."
          >
            <select value={value.kind} onChange={(event) => update('kind', event.target.value)}>
              <option value="service">Client / development service</option>
              <option value="software">Software / SaaS product</option>
            </select>
          </CampaignField>
          <CampaignField
            label="Service category"
            help="Pick a starting category or enter your own below."
          >
            <select
              value={
                [
                  'Custom software development',
                  'Ecommerce development',
                  'Website development',
                  'Mobile application',
                  'AI automation',
                  'Software / SaaS',
                ].includes(value.category)
                  ? value.category
                  : 'Other'
              }
              onChange={(event) =>
                update('category', event.target.value === 'Other' ? '' : event.target.value)
              }
            >
              {[
                'Custom software development',
                'Ecommerce development',
                'Website development',
                'Mobile application',
                'AI automation',
                'Software / SaaS',
                'Other',
              ].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </CampaignField>
          {![
            'Custom software development',
            'Ecommerce development',
            'Website development',
            'Mobile application',
            'AI automation',
            'Software / SaaS',
          ].includes(value.category) && (
            <CampaignField
              label="Your service category"
              help="Name the real category of your offer."
            >
              <input
                maxLength={150}
                value={value.category}
                onChange={(event) => update('category', event.target.value)}
              />
            </CampaignField>
          )}
          <CampaignField
            label="Target country"
            help="This workspace researches one country. Use Service research when you want to compare countries."
          >
            <select
              required
              value={value.country}
              onChange={(event) =>
                setValue({ ...value, country: event.target.value, candidateLocationIds: [] })
              }
            >
              {Object.entries(countryNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </CampaignField>
        </div>
        <CampaignField
          label="What do you offer?"
          help="Explain the problem, scope and outcome you can support. Avoid guaranteed results."
        >
          <textarea
            required
            minLength={10}
            maxLength={4000}
            value={value.description}
            onChange={(event) => update('description', event.target.value)}
          />
        </CampaignField>
        <CampaignField
          label="Who should buy this service?"
          help="Describe actual buyer businesses, roles, size, problems and buying triggers."
        >
          <textarea
            required
            minLength={10}
            maxLength={4000}
            value={value.buyerProfile}
            onChange={(event) => update('buyerProfile', event.target.value)}
          />
        </CampaignField>
        {[
          [
            'deliverables',
            'What is included?',
            'Scope, integrations, support, delivery capacity and what the client receives.',
          ],
          ['differentiation', 'Why choose your offer?', 'State advantages you can demonstrate.'],
          [
            'proof',
            'Portfolio and proof notes',
            'List real case studies, screenshots or experience. Add dated source links below for stronger evidence.',
          ],
        ].map(([key, label, help]) => (
          <CampaignField key={key} label={label} help={help}>
            <textarea
              maxLength={4000}
              value={value[key]}
              onChange={(event) => update(key, event.target.value)}
            />
          </CampaignField>
        ))}
        <details className="guide-step">
          <summary>Target regions inside this country (optional)</summary>
          {locationError && <p role="alert">{locationError}</p>}
          <RegionPicker
            countries={[value.country]}
            countryNames={countryNames}
            selected={value.candidateLocationIds}
            locations={locations}
            onLocations={(rows) =>
              setLocations((current) => [
                ...current.filter((row) => !rows.some((next) => next.id === row.id)),
                ...rows,
              ])
            }
            onChange={(ids) => update('candidateLocationIds', ids)}
            api={api}
            run={run}
            busy={busy}
          />
        </details>
        <details className="guide-step">
          <summary>Campaign preferences and actual economics (optional)</summary>
          <p>
            All amounts use the currency you enter. Unknown values stay unknown; this does not
            forecast sales or ad costs.
          </p>
          <div className="form-grid">
            <CampaignField
              label="Campaign goal"
              help="Leads are enquiries or client requests. Purchases are paid signups or purchases on your site."
            >
              <select value={value.goal} onChange={(event) => update('goal', event.target.value)}>
                <option value="leads">Website leads / client enquiries</option>
                <option value="purchases">Website purchases / signups</option>
              </select>
            </CampaignField>
            <CampaignField
              label="Price currency"
              help="Currency of your service price and delivery cost. Campaign economics require the connected ad account currency; no conversion is assumed."
            >
              <input
                required
                pattern="[A-Z]{3}"
                maxLength={3}
                value={value.currency}
                onChange={(event) => update('currency', event.target.value.toUpperCase())}
              />
            </CampaignField>
            {numeric(
              'price',
              'Actual project / subscription price',
              'Leave empty until the price for this scope and billing period is known.',
            )}
            {numeric(
              'deliveryCost',
              'Actual service delivery cost',
              'Your actual cost for delivering that same scope and period.',
            )}
            {numeric(
              'requiredProfit',
              'Required profit',
              'Your desired profit for the same sale and billing period.',
            )}
            {numeric(
              'leadCloseRate',
              'Measured lead-to-sale rate %',
              'Use a measured conversion rate; leave empty when you do not have one.',
              true,
            )}
            <CampaignField
              label="Offer / contact page URL"
              help="Use the public HTTPS page for this exact offer."
            >
              <input
                type="url"
                value={value.landingUrl}
                onChange={(event) => update('landingUrl', event.target.value)}
              />
            </CampaignField>
          </div>
          <MediaPicker
            api={api}
            value={value.mediaAssetId}
            thumbnail={value.thumbnailAssetId}
            onChange={(mediaAssetId, thumbnailAssetId) =>
              setValue({ ...value, mediaAssetId, thumbnailAssetId })
            }
          />
        </details>
        <EvidenceInputs brief={value} setBrief={setValue} />
        <AdLibraryPicker
          businessId={data.business.id}
          selected={value.adLibraryIds}
          onChange={(ids) => update('adLibraryIds', ids)}
          busy={busy}
        />
        <div className="services-actions">
          <button className="button primary" disabled={busy}>
            Save service
          </button>
          <button type="button" className="button secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </article>
  );
}

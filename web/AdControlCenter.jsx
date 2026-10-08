import React, { useEffect, useState } from 'react';
import { CampaignField } from './FieldHelp.jsx';
import { useDraft } from './use-draft.js';
import { getLanguage } from './i18n.js';

const today = (timeZone = 'Asia/Dhaka') =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
const empty = {
  campaignId: '',
  reference: '',
  status: 'new',
  observedOn: today(),
  receivedRevenue: '0',
  refunds: '0',
  actualCost: '',
  source: '',
  note: '',
};
const money = (value, currency = 'BDT') =>
  value == null
    ? '—'
    : new Intl.NumberFormat(getLanguage() === 'bn' ? 'bn-BD' : 'en-GB', {
        style: 'currency',
        currency,
      }).format(value);

export function AdControlCenter({ data, api, run, busy, setPage }) {
  const currentDay = () => today(data.integration.timezone || 'Asia/Dhaka');
  const [account, setAccount] = useState(null);
  const [report, setReport] = useState(null);
  const [tab, setTab] = useState('outcomes');
  const [inventory, setInventory] = useState('campaigns');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState({
    from: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    to: currentDay(),
  });
  const [form, setForm] = useDraft(`adpilot-draft:${data.business.id}:${data.user.id}:outcomes`, {
    ...empty,
    observedOn: currentDay(),
  });
  const [editing, setEditing] = useState(false);
  const campaign = data.campaigns.find((row) => row.id === form.campaignId);
  const plan = data.plans.find((row) => row.id === campaign?.planId);
  const kind = plan?.conversionEvent === 'LEAD' ? 'lead' : 'order';
  const currency = plan?.accountCurrency || data.integration.currency || 'BDT';
  const parameters = new URLSearchParams(period).toString();
  async function loadResults() {
    setReport(await api(`/operations/results?${parameters}`));
  }
  useEffect(() => {
    let active = true;
    Promise.all([api('/operations/account'), api(`/operations/results?${parameters}`)])
      .then(([snapshot, result]) => {
        if (active) {
          setAccount(snapshot);
          setReport(result);
        }
      })
      .catch((error) => {
        if (active)
          run(() => {
            throw error;
          });
      });
    return () => {
      active = false;
    };
  }, [data.business.id]);
  const field = (key, label, help, props = {}) => (
    <CampaignField label={label} help={help}>
      <input
        value={form[key] ?? ''}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
        {...props}
      />
    </CampaignField>
  );
  const items = (account?.[inventory] || []).filter((row) =>
    `${row.name || ''} ${row.id || ''} ${row.effective_status || ''}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="tools-heading">
        <span className="eyebrow">YOUR WORKSPACE</span>
        <h1>Ad control center</h1>
        <p>Check delivery, record customer outcomes and review spending before making a change.</p>
      </div>
      <article className="panel tools-panel">
        <h2>Campaign readiness</h2>
        <div className="readiness-grid">
          <div>
            <strong>Meta account</strong>
            <p>{data.integration.configured ? 'Connected' : 'Connect your Meta account'}</p>
          </div>
          <div>
            <strong>Research decisions</strong>
            <p>
              {data.researchProjects.filter((row) => row.status === 'approved').length} approved
            </p>
          </div>
          <div>
            <strong>Campaign approval</strong>
            <p>{data.approvals.filter((row) => row.status === 'pending').length} awaiting review</p>
          </div>
          <div>
            <strong>Failure recovery</strong>
            <p>
              {data.campaigns.filter((row) => row.status === 'needs_reconciliation').length} require
              reconciliation
            </p>
          </div>
        </div>
        <p className="notice">
          Keep one offer and one ad set for a small test. Research approval does not launch an ad.
          Every launch, resume, targeting, creative or budget change needs its own review.
        </p>
        <div className="tools-actions">
          <button className="button secondary" onClick={() => setPage('Research studio')}>
            Research studio
          </button>
          <button className="button secondary" onClick={() => setPage('Performance')}>
            Campaign operations
          </button>
          <button className="button secondary" onClick={() => setPage('Approvals')}>
            Approvals
          </button>
          <button className="button secondary" onClick={() => setPage('Accounts')}>
            Accounts
          </button>
        </div>
      </article>
      <div className="tools-actions control-tabs">
        <button
          className={`button ${tab === 'outcomes' ? 'primary' : 'secondary'}`}
          onClick={() => setTab('outcomes')}
        >
          Actual business results
        </button>
        <button
          className={`button ${tab === 'account' ? 'primary' : 'secondary'}`}
          onClick={() => setTab('account')}
        >
          Meta account & delivery
        </button>
      </div>
      {tab === 'outcomes' ? (
        <>
          <article className="panel tools-panel">
            <h2>Measured results</h2>
            <p>
              Facebook attribution and confirmed customer payments are different. Enter real
              outcomes and sync campaign insights. Missing costs or spend keep profitability
              unknown.
            </p>
            <form
              className="tools-actions"
              onSubmit={(event) => {
                event.preventDefault();
                run(loadResults);
              }}
            >
              <label className="field">
                <span>From date</span>
                <input
                  type="date"
                  aria-label="From date"
                  required
                  value={period.from}
                  max={period.to}
                  onChange={(event) => setPeriod({ ...period, from: event.target.value })}
                />
              </label>
              <label className="field">
                <span>To date</span>
                <input
                  type="date"
                  aria-label="To date"
                  required
                  value={period.to}
                  min={period.from}
                  max={currentDay()}
                  onChange={(event) => setPeriod({ ...period, to: event.target.value })}
                />
              </label>
              <button className="button secondary" disabled={busy}>
                Refresh results
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={busy || !report?.outcomes.length}
                onClick={() =>
                  run(async () => {
                    const response = await fetch(
                      `${import.meta.env.BASE_URL}api/operations/outcomes.csv?${new URLSearchParams(report.period)}`,
                      {
                        credentials: 'same-origin',
                        headers: { 'x-workspace-id': data.business.id },
                      },
                    );
                    if (!response.ok)
                      throw new Error('The export could not be downloaded. Refresh and try again.');
                    const url = URL.createObjectURL(await response.blob());
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = 'adpilot-outcomes.csv';
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  })
                }
              >
                Export outcomes CSV
              </button>
            </form>
            <div className="country-comparisons">
              {(report?.results || []).map((result) => (
                <section className="campaign-context" key={result.campaignId}>
                  <h3>{result.name}</h3>
                  <p>
                    {result.currency} · {result.status}
                  </p>
                  <dl className="results-grid">
                    <dt>Synced ad spend</dt>
                    <dd>{money(result.adSpend, result.currency)}</dd>
                    <dt>Confirmed payments after refunds</dt>
                    <dd>{money(result.receivedRevenue, result.currency)}</dd>
                    <dt>Actual delivery costs</dt>
                    <dd>{money(result.actualCost, result.currency)}</dd>
                    <dt>Contribution after advertising</dt>
                    <dd>{money(result.contributionAfterAds, result.currency)}</dd>
                    <dt>Confirmed sales</dt>
                    <dd>{result.confirmedSales}</dd>
                    <dt>Qualified leads</dt>
                    <dd>{result.qualifiedLeads}</dd>
                    <dt>Failed / returned deliveries</dt>
                    <dd>{result.failedOrReturned}</dd>
                    <dt>Cost per confirmed sale</dt>
                    <dd>{money(result.costPerConfirmedSale, result.currency)}</dd>
                  </dl>
                  <p className="notice">{result.decision}</p>
                  <small>
                    Results reflect entered outcomes for the selected dates. Missing entries affect
                    the conclusion.
                  </small>
                </section>
              ))}
            </div>
            {!data.campaigns.length && (
              <p>No campaigns yet. Prepare and approve a campaign draft first.</p>
            )}
          </article>
          <article className="panel tools-panel">
            <h2>Record a real customer outcome</h2>
            <p>
              Use an order or enquiry reference instead of personal customer details. Reusing the
              same reference for the same campaign updates its outcome and prevents double counting.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await api('/operations/outcomes', 'POST', {
                    ...form,
                    kind,
                    receivedRevenue: Number(form.receivedRevenue),
                    refunds: Number(form.refunds),
                    actualCost: form.actualCost === '' ? null : Number(form.actualCost),
                  });
                  await loadResults();
                  setForm({ ...empty, campaignId: form.campaignId, observedOn: currentDay() });
                  setEditing(false);
                }, 'Customer outcome saved. Results use recorded facts, not forecasts.');
              }}
            >
              <CampaignField
                label="Outcome campaign"
                help="Choose the campaign that generated this enquiry or order. All payments and costs must use that campaign account currency."
              >
                <select
                  required
                  disabled={editing}
                  value={form.campaignId}
                  onChange={(event) =>
                    setForm({ ...empty, campaignId: event.target.value, observedOn: currentDay() })
                  }
                >
                  <option value="">Choose a campaign</option>
                  {data.campaigns.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </CampaignField>
              <div className="form-grid">
                {field(
                  'reference',
                  'Order / enquiry reference',
                  'Use the unique reference from your order tracker or enquiry log. Reusing it updates this record.',
                  { required: true, minLength: 2, maxLength: 120, readOnly: editing },
                )}
                <CampaignField
                  label="Outcome status"
                  help="Qualified means a lead fits your offer. Won means a paying client. Delivered means a fulfilled order. Failed and returned outcomes also matter for Bangladesh COD."
                >
                  <select
                    value={form.status}
                    onChange={(event) => setForm({ ...form, status: event.target.value })}
                  >
                    {(kind === 'lead'
                      ? ['new', 'qualified', 'won', 'lost']
                      : ['new', 'delivered', 'returned', 'failed']
                    ).map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </CampaignField>
              </div>
              <div className="form-grid">
                {field(
                  'observedOn',
                  'Outcome date',
                  'When this customer result actually happened. The report groups entries by this date.',
                  { type: 'date', required: true, max: today() },
                )}
                {field(
                  'source',
                  'Outcome evidence / source',
                  'Use your order-system reference, payment record or interview-log reference. These are your recorded observations, not independently verified results.',
                  { required: true, minLength: 3, maxLength: 500 },
                )}
              </div>
              <p className="notice">
                Payment and cost currency: {currency}. Enter received payments, not the price you
                hoped to charge.
              </p>
              <div className="form-grid">
                {field(
                  'receivedRevenue',
                  'Payment received',
                  'Enter actual money received for this order or won client. New and qualified enquiries have no received payment.',
                  { type: 'number', min: 0, step: '0.01', required: true },
                )}
                {field(
                  'refunds',
                  'Refunds paid',
                  'Money refunded from the payment recorded for this same customer outcome.',
                  { type: 'number', min: 0, step: '0.01', required: true },
                )}
                {field(
                  'actualCost',
                  'Actual incurred cost (optional)',
                  'Include product, delivery, packaging, payment fees, returns or actual service delivery costs. Leave empty if unknown; enter zero only when cost is really zero.',
                  { type: 'number', min: 0, step: '0.01' },
                )}
                {field(
                  'note',
                  'Outcome note (optional)',
                  'Record a delivery issue or buyer observation that will help improve the next offer. Avoid private customer information.',
                  { maxLength: 2000 },
                )}
              </div>
              <div className="tools-actions">
                <button className="button primary" disabled={busy || !campaign}>
                  Save customer outcome
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setEditing(false);
                    setForm({ ...empty, observedOn: currentDay() });
                  }}
                >
                  Clear outcome form
                </button>
              </div>
            </form>
          </article>
          <article className="panel tools-panel">
            <h2>Outcome history</h2>
            {(report?.outcomes || []).map((row) => (
              <div className="research-evidence" key={row.id}>
                <strong>{row.reference}</strong>
                <p>
                  {row.kind} · {row.status} · {row.observedOn} ·{' '}
                  {money(row.receivedRevenue - row.refunds, row.currency)}
                </p>
                <p>{row.source}</p>
                <div className="tools-actions">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      const {
                        campaignId,
                        reference,
                        status,
                        observedOn,
                        receivedRevenue,
                        refunds,
                        actualCost,
                        source,
                        note,
                      } = row;
                      setForm({
                        campaignId,
                        reference,
                        status,
                        observedOn,
                        receivedRevenue: String(receivedRevenue),
                        refunds: String(refunds),
                        actualCost: actualCost == null ? '' : String(actualCost),
                        source,
                        note,
                        expectedRevision: row.revision,
                      });
                      setEditing(true);
                    }}
                  >
                    Edit outcome
                  </button>
                  {['admin', 'approver'].includes(data.user.role) && (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api(`/operations/outcomes/${row.id}/void`, 'POST', {});
                          await loadResults();
                        }, 'Outcome voided and retained in the audit log.')
                      }
                    >
                      Void incorrect outcome
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!report?.outcomes.length && <p>No customer outcomes recorded for these dates.</p>}
          </article>
        </>
      ) : (
        <>
          <article className="panel tools-panel">
            <div className="tools-row">
              <h2>Connected ad account</h2>
              <button
                className="button primary"
                disabled={busy || !data.integration.configured}
                onClick={() =>
                  run(async () => {
                    setAccount(await api('/operations/account/check', 'POST', {}));
                  }, 'Account inventory checked. No ad settings were changed.')
                }
              >
                Check Meta account & delivery
              </button>
            </div>
            <p>
              Check account status, all accessible campaigns, ad sets and ads. These checks do not
              change delivery or budgets. Checks are cached for one minute.
            </p>
            {account ? (
              <>
                <p>
                  {account.account.name} · {account.account.currency} · Account status:{' '}
                  {account.account.account_status} · {new Date(account.checkedAt).toLocaleString()}
                </p>
                <p className="notice">
                  {account.demo
                    ? 'This is a demo account. No real delivery data is shown.'
                    : 'This inventory includes campaigns created outside AdPilot. Changes can be requested for AdPilot-managed campaigns through Campaign operations.'}
                </p>
                {account.truncated && (
                  <p className="notice">
                    The account has more results than this bounded snapshot includes. The displayed
                    inventory is incomplete.
                  </p>
                )}
                <div className="tools-actions">
                  <select
                    aria-label="Account inventory level"
                    value={inventory}
                    onChange={(event) => setInventory(event.target.value)}
                  >
                    <option value="campaigns">Campaigns</option>
                    <option value="adSets">Ad sets</option>
                    <option value="ads">Ads</option>
                  </select>
                  <input
                    aria-label="Search account inventory"
                    placeholder="Search by name, ID or status"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                {account.inventoryErrors?.[inventory] && (
                  <p className="notice">
                    This inventory could not be retrieved. Check Meta permissions or try the account
                    check again. Other retrieved sections remain available.
                  </p>
                )}
                {items.map((row) => (
                  <section className="research-evidence" key={row.id}>
                    <strong>{row.name}</strong>
                    <p>
                      {row.id} · {row.effective_status || row.status}{' '}
                      {row.objective && `· ${row.objective}`}
                    </p>
                    {(row.daily_budget || row.lifetime_budget) && (
                      <p>
                        Configured budget:{' '}
                        {money(
                          Number(row.daily_budget || row.lifetime_budget) / 100,
                          account.account.currency,
                        )}{' '}
                        {row.daily_budget ? '/ day' : 'lifetime'}
                      </p>
                    )}
                    {row.targeting?.geo_locations && (
                      <details>
                        <summary>Actual Meta location targeting</summary>
                        <pre className="geo-json">
                          {JSON.stringify(row.targeting.geo_locations, null, 2)}
                        </pre>
                      </details>
                    )}
                    {row.ad_review_feedback && (
                      <details>
                        <summary>Meta ad review feedback</summary>
                        <pre className="geo-json">
                          {JSON.stringify(row.ad_review_feedback, null, 2)}
                        </pre>
                      </details>
                    )}
                  </section>
                ))}
                {!items.length && <p>No matching items in the checked account inventory.</p>}
              </>
            ) : (
              <p>Run an account check to retrieve current Meta data.</p>
            )}
          </article>
          <article className="panel tools-panel">
            <h2>Actual regional delivery</h2>
            <p>
              Meta-reported spend and clicks over the last 30 days. Delivery data cannot prove buyer
              demand or regional profitability.
            </p>
            {account?.regionalError && (
              <p className="notice">
                Regional data is unavailable for this account or permission level. No estimates
                replace it.
              </p>
            )}
            <div className="country-comparisons">
              {(account?.regions || []).map((row, index) => (
                <section className="campaign-context" key={index}>
                  <h3>
                    {row.country} · {row.region}
                  </h3>
                  <p>{row.campaign_name || row.campaign_id}</p>
                  <p>
                    {row.date_start} — {row.date_stop}
                  </p>
                  <p>Spend: {money(Number(row.spend), account.account.currency)}</p>
                  <p>
                    Impressions: {row.impressions} · Clicks: {row.clicks}
                  </p>
                </section>
              ))}
            </div>
            {!account?.regions.length && <p>No regional delivery data is available yet.</p>}
          </article>
        </>
      )}
    </>
  );
}

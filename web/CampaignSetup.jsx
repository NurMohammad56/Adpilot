import React, { useEffect, useState } from 'react';
import { CampaignField, FieldHelp } from './FieldHelp.jsx';

export function CampaignSetup({
  data,
  project,
  version,
  countryName,
  targetNames = [],
  fields,
  setFields,
  api,
  run,
  busy,
  media,
  refresh,
  onPlan,
  children,
}) {
  const currency = data.integration.currency || 'BDT';
  const [preset, setPreset] = useState(null);
  const [presetError, setPresetError] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [economics, setEconomics] = useState(
    fields.economicsMode || (fields.price ? 'known' : 'unknown'),
  );
  const [error, setError] = useState('');
  const amount = (number) =>
    `${Number(number).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
  const daily = Number(fields.dailyBudget),
    duration = Number(fields.durationDays);
  const total = Math.round(daily * duration * 100) / 100;
  const update = (key, value) => setFields((current) => ({ ...current, [key]: value }));
  function applyPreset(value) {
    setFields((current) => ({
      ...current,
      dailyBudget: String(value.dailyBudget),
      durationDays: '7',
      testBudgetCeiling: String(value.totalBudget),
      budgetPreference: 'starter',
      manualCeiling: false,
      budgetCurrency: currency,
    }));
  }
  useEffect(() => {
    let active = true;
    setPreset(null);
    setPresetError(false);
    api('/campaigns/budget-preset')
      .then((value) => {
        if (!active) return;
        setPreset(value);
        if (!value.available) setPresetError(true);
        else if (
          fields.budgetPreference === 'starter' &&
          !fields.dailyBudget &&
          value.currency === currency
        )
          applyPreset(value);
      })
      .catch(() => {
        if (active) setPresetError(true);
      });
    return () => {
      active = false;
    };
  }, [currency, data.business.id]);
  const currencyChanged = fields.budgetCurrency && fields.budgetCurrency !== currency;
  const invalidDashboard = (() => {
    try {
      const url = new URL(fields.landingUrl);
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      return (
        Boolean(base) &&
        url.origin === location.origin &&
        (url.pathname === base || url.pathname.startsWith(base + '/'))
      );
    } catch {
      return false;
    }
  })();
  const help = {
    goal: 'For a client service, choose website leads: people visit your page and send an enquiry. Choose purchases only when people can pay on your website.',
    landingUrl:
      'Paste your public service or contact page, where a potential client can read your offer and contact you. Do not use this AdPilot dashboard or a login page.',
    dailyBudget:
      'This is the planning average in the connected ad account currency. We set one fixed total lifetime budget for the test. Meta may spend more or less on individual days. It is not your project price or a daily spending limit.',
    durationDays:
      'Start with 7 days, then review actual enquiries before spending again. This creates a scheduled test, not an automatically renewing subscription.',
    testBudgetCeiling:
      'The planned daily budget multiplied by the test days must fit within this limit and your workspace limits. It does not include card fees or taxes.',
    price:
      'How much one client pays for a complete project or sale, in the account currency. For example, a project fee, not the $3 daily advertising budget. Leave it unknown if you do not know yet.',
    deliveryCost:
      'Your actual cost to deliver one client project: team, contractors, tools and other costs. Enter 0 only if the real cost is zero.',
    requiredProfit:
      'The profit you want to keep from one completed project after delivery costs and advertising. Enter a real amount, or use the unknown pricing option.',
    leadCloseRate:
      'The percentage of actual enquiries that became paying clients. Use your own measured results, not a guess. Leave this empty if you have not measured it.',
  };
  const numberField = (key, label, { required = true, min = 0, max, step = '0.01' } = {}) => (
    <CampaignField key={key} label={label} help={help[key]}>
      <input
        name={key}
        type="number"
        min={min}
        max={max}
        step={step}
        required={required}
        value={fields[key] ?? ''}
        onChange={(event) => {
          setError('');
          setFields((current) => ({
            ...current,
            [key]: event.target.value,
            ...(key === 'testBudgetCeiling' ? { manualCeiling: true } : {}),
            ...(['dailyBudget', 'durationDays', 'testBudgetCeiling'].includes(key)
              ? { budgetPreference: 'custom', budgetCurrency: currency }
              : {}),
            ...(['dailyBudget', 'durationDays'].includes(key) &&
            (current.manualCeiling === false || current.budgetPreference === 'starter')
              ? {
                  testBudgetCeiling: String(
                    Math.round(
                      Number(key === 'dailyBudget' ? event.target.value : current.dailyBudget) *
                        Number(key === 'durationDays' ? event.target.value : current.durationDays) *
                        100,
                    ) / 100,
                  ),
                }
              : {}),
          }));
        }}
      />
    </CampaignField>
  );
  return (
    <article className="panel tools-panel campaign-setup">
      <h2>Easy campaign setup</h2>
      <div className="campaign-context">
        <strong>{project.name}</strong>
        <p>Approved test market: {countryName}</p>
        {targetNames.length > 0 && (
          <p>Target areas: {targetNames.join(', ')} · One shared ad set and budget</p>
        )}
        <p>{project.buyerProfile}</p>
      </div>
      <p>
        Start with a small test. We use your approved research for the audience and ad copy. Add
        your client page and creative, then review the draft.
      </p>
      <div className="notice">
        The test uses one fixed total lifetime budget. The daily amount is a planning average; daily
        spend can vary. Taxes and payment fees are additional. No budget is increased automatically.
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          if (currencyChanged) {
            setError(
              'The account currency changed. Apply the starter preset or re-enter your budget before continuing.',
            );
            return;
          }
          if (invalidDashboard) {
            setError('Use a public service or contact page, not the AdPilot dashboard.');
            return;
          }
          if (total > Number(fields.testBudgetCeiling)) {
            setError(
              'The planned total is higher than your spending ceiling. Reduce the budget or days, or edit the ceiling.',
            );
            return;
          }
          if (
            daily > data.business.dailyBudgetCeiling ||
            total > data.business.totalBudgetCeiling
          ) {
            setError('This budget exceeds your workspace limits. Reduce the budget or days.');
            return;
          }
          if (!media.mediaAssetId || !fields.acknowledgeUnknownCPA) return;
          run(async () => {
            const plan = await api(`/research/versions/${version.id}/campaign`, 'POST', {
              goal: fields.goal,
              landingUrl: fields.landingUrl.trim(),
              price: economics === 'known' && fields.price ? Number(fields.price) : null,
              deliveryCost:
                economics === 'known' && fields.deliveryCost !== ''
                  ? Number(fields.deliveryCost)
                  : null,
              requiredProfit:
                economics === 'known' && fields.requiredProfit !== ''
                  ? Number(fields.requiredProfit)
                  : null,
              leadCloseRate:
                economics === 'known' && fields.leadCloseRate
                  ? Number(fields.leadCloseRate) / 100
                  : null,
              dailyBudget: daily,
              durationDays: duration,
              testBudgetCeiling: Number(fields.testBudgetCeiling),
              acknowledgeUnknownCPA: fields.acknowledgeUnknownCPA,
              ...media,
            });
            await refresh();
            onPlan(plan);
          }, 'Campaign draft created. Review its copy, media, budgets and validation before requesting launch approval.');
        }}
      >
        <h3>1. What should the client do?</h3>
        <CampaignField label="Campaign goal" help={help.goal}>
          <select
            name="goal"
            value={fields.goal}
            onChange={(event) => update('goal', event.target.value)}
          >
            <option value="leads">Website leads / client enquiries</option>
            <option value="purchases">Website purchase / paid subscription</option>
          </select>
        </CampaignField>
        <CampaignField
          label="HTTPS offer / contact page"
          help={help.landingUrl}
          hint="Use the public page your clients should visit."
        >
          <input
            name="landingUrl"
            type="url"
            pattern="https://.*"
            required
            placeholder="https://your-business.com/services"
            value={fields.landingUrl}
            onChange={(event) => {
              update('landingUrl', event.target.value);
              setError('');
            }}
          />
        </CampaignField>
        {invalidDashboard && (
          <p className="field-error">
            Use a public service or contact page, not the AdPilot dashboard.
          </p>
        )}
        <h3>2. Choose a small test budget</h3>
        <div className="campaign-budget-preset">
          <button
            type="button"
            className="button secondary"
            disabled={busy || !preset?.available || preset.currency !== currency}
            onClick={() => {
              applyPreset(preset);
              setError('');
            }}
          >
            Use $3/day starter
          </button>
          {preset?.available && (
            <span>Suggested starter: {amount(preset.dailyBudget)} per day for 7 days.</span>
          )}
          {preset?.source && (
            <small>
              Indicative exchange rate: 1 USD = {preset.rate} {currency}. Updated{' '}
              {new Date(preset.rateUpdatedAt).toLocaleDateString()}.{' '}
              <a href={preset.source} target="_blank" rel="noreferrer">
                Rates by ExchangeRate-API
              </a>
            </small>
          )}
          {presetError && (
            <p className="notice">
              The USD conversion is unavailable. Enter a budget in your account currency; $3 has not
              been converted.
            </p>
          )}
        </div>
        {currencyChanged && (
          <p className="field-error">
            The account currency changed. Apply the starter preset or re-enter your budget before
            continuing.
          </p>
        )}
        <p>Ad account currency: {currency}. The selected country does not change this currency.</p>
        <div className="form-grid">
          {numberField('dailyBudget', 'Daily test budget', { min: 0.01 })}
          {numberField('durationDays', 'Test duration in days', { min: 1, max: 30, step: '1' })}
        </div>
        <div className="campaign-budget-summary" role="status">
          <strong>Planned total: {Number.isFinite(total) ? amount(total) : '—'}</strong>
          <span>Spending ceiling: {amount(fields.testBudgetCeiling)}</span>
          <small>Review the results before renewing. No automatic budget increase.</small>
        </div>
        <button
          type="button"
          className="text-button"
          aria-expanded={advanced}
          onClick={() => setAdvanced((value) => !value)}
        >
          Adjust spending ceiling
        </button>
        {advanced && numberField('testBudgetCeiling', 'Total test spending ceiling', { min: 0.01 })}
        <h3>3. Project pricing (optional)</h3>
        <CampaignField
          label="Do you know your project price and costs?"
          help="Keep this unknown to start a small discovery test. Add real project economics when you have them; we never invent a profit or customer forecast."
        >
          <select
            value={economics}
            onChange={(event) => {
              setEconomics(event.target.value);
              update('economicsMode', event.target.value);
            }}
          >
            <option value="unknown">Not yet — start a small discovery test</option>
            <option value="known">Yes — enter my real project price and costs</option>
          </select>
        </CampaignField>
        {economics === 'known' ? (
          <div className="form-grid">
            {numberField('price', 'Price per sale / project (leave empty if unknown)', {
              min: 0.01,
            })}
            {numberField('deliveryCost', 'Actual service delivery cost')}
            {numberField('requiredProfit', 'Required profit per sale / project')}
            {numberField('leadCloseRate', 'Measured lead-to-sale rate % (optional)', {
              required: false,
              min: 0.01,
              max: 100,
            })}
          </div>
        ) : (
          <p>
            Project price, delivery cost and profit are unknown. This draft will not predict
            customer acquisition cost or profit.
          </p>
        )}
        <h3>4. Add your ad image or video</h3>
        {children}
        <div className="campaign-check-header">
          <label className="tools-check">
            <input
              type="checkbox"
              name="acknowledgeUnknownCPA"
              checked={fields.acknowledgeUnknownCPA}
              onChange={(event) => update('acknowledgeUnknownCPA', event.target.checked)}
            />
            I understand this is a small test and results are not guaranteed.
          </label>
          <FieldHelp
            label="Small test acknowledgement"
            text="You are preparing a draft. If project economics are unknown, this test has no profit forecast. You must separately review and approve the final ad before launch."
          />
        </div>
        {!media.mediaAssetId && (
          <p className="notice">Upload or choose an ad image or video to continue.</p>
        )}
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary"
          disabled={busy || !media.mediaAssetId || !fields.acknowledgeUnknownCPA}
        >
          Generate campaign draft for review
        </button>
      </form>
    </article>
  );
}

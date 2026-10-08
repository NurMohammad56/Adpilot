import React, { useState } from 'react';
import { MediaPicker } from './WorkspaceTools.jsx';
import { ArrowRight, ShieldCheck } from 'lucide-react';
const Field = ({ label, children }) => (
  <label className="field">
    <span>{label}</span>
    {children}
  </label>
);
export function ActionForm({ campaign, data, busy, onSave, api }) {
  const plan = data.plans.find((p) => p.id === campaign.planId);
  const audience = campaign.audience || plan.audienceRecommendation;
  const ads = data.ads.filter((ad) => ad.campaignId === campaign.id);
  const [action, setAction] = useState('update_budget');
  const [dailyBudget, setDailyBudget] = useState(campaign.dailyBudget);
  const [target, setTarget] = useState({
    locations: audience.locations,
    ageMin: audience.ageMin,
    ageMax: audience.ageMax,
  });
  const [adId, setAdId] = useState(ads[0]?.id || '');
  function original(ad) {
    const source =
      ad.currentCreative || plan.ads.find((item) => item.id === ad.creativeKey) || plan.ads[0];
    const { id, hypothesis, ...value } = source;
    return value;
  }
  const [creative, setCreative] = useState(ads.length ? original(ads[0]) : {});
  const [experimentLabel, setExperimentLabel] = useState('Primary audience controlled experiment');
  const [reason, setReason] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const payload =
          action === 'update_budget'
            ? { dailyBudget }
            : action === 'update_targeting'
              ? { ...target, experimentLabel }
              : { adId, creative, experimentLabel };
        onSave({ action, payload, reason });
      }}
    >
      <div className="notice">
        <ShieldCheck size={18} />
        This prepares one proposed change. A human must review its exact payload before it executes
        through MCP. The total spend cap stays unchanged.
      </div>
      <Field label="Change to propose">
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="update_budget">Change configured daily budget</option>
          <option value="update_targeting">Change audience / location</option>
          <option value="replace_creative">Replace one ad creative</option>
        </select>
      </Field>
      {action === 'update_budget' && (
        <Field label="Proposed configured daily budget (৳)">
          <input
            type="number"
            min="1"
            required
            value={dailyBudget}
            onChange={(e) => setDailyBudget(Number(e.target.value))}
          />
        </Field>
      )}
      {action === 'update_targeting' && (
        <>
          <Field label="Bangladesh locations">
            <div className="checkboxes">
              {(plan.kind === 'service' ? [plan.market] : data.business.deliveryRegions).map(
                (region) => (
                  <label key={region}>
                    <input
                      type="checkbox"
                      checked={target.locations.includes(region)}
                      onChange={(e) =>
                        setTarget({
                          ...target,
                          locations: e.target.checked
                            ? [...target.locations, region]
                            : target.locations.filter((r) => r !== region),
                        })
                      }
                    />
                    {region}
                  </label>
                ),
              )}
            </div>
          </Field>
          <div className="form-grid">
            {['ageMin', 'ageMax'].map((key) => (
              <Field key={key} label={key === 'ageMin' ? 'Minimum age' : 'Maximum age'}>
                <input
                  type="number"
                  min="18"
                  max="65"
                  required
                  value={target[key]}
                  onChange={(e) => setTarget({ ...target, [key]: Number(e.target.value) })}
                />
              </Field>
            ))}
          </div>
        </>
      )}
      {action === 'replace_creative' && (
        <>
          <Field label="Ad to update">
            <select
              value={adId}
              onChange={(e) => {
                setAdId(e.target.value);
                setCreative(original(ads.find((ad) => ad.id === e.target.value)));
              }}
            >
              {ads.map((ad, i) => (
                <option value={ad.id} key={ad.id}>
                  Ad {i + 1} ·{' '}
                  {
                    (ad.currentCreative || plan.ads.find((item) => item.id === ad.creativeKey))
                      ?.headline
                  }
                </option>
              ))}
            </select>
          </Field>
          {['hook', 'headline', 'primaryText', 'concept', 'imageUrl'].map((key) => (
            <Field key={key} label={key.replace(/([A-Z])/g, ' $1')}>
              {['primaryText', 'concept'].includes(key) ? (
                <textarea
                  required
                  value={creative[key] || ''}
                  onChange={(e) => setCreative({ ...creative, [key]: e.target.value })}
                />
              ) : (
                <input
                  type={key === 'imageUrl' ? 'url' : 'text'}
                  required={key !== 'imageUrl' || data.mode === 'live'}
                  value={creative[key] || ''}
                  onChange={(e) => setCreative({ ...creative, [key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </>
      )}
      {action !== 'update_budget' && (
        <>
          {action === 'replace_creative' && (
            <MediaPicker
              api={api}
              value={creative.mediaAssetId}
              thumbnail={creative.thumbnailAssetId}
              onChange={(mediaAssetId, thumbnailAssetId) =>
                setCreative({ ...creative, mediaAssetId, thumbnailAssetId })
              }
            />
          )}
          <Field label="Experiment label">
            <input
              required
              value={experimentLabel}
              onChange={(e) => setExperimentLabel(e.target.value)}
            />
          </Field>
        </>
      )}
      <Field label="Reason and expected impact">
        <textarea
          rows={3}
          required
          minLength={10}
          maxLength={2000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What evidence supports this change, and what will you measure?"
        />
      </Field>
      <div className="modal-actions">
        <button className="button primary" disabled={busy}>
          Request approval
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
export function ActionSummary({ approval }) {
  if (!['update_targeting', 'replace_creative'].includes(approval?.action)) return null;
  const p = approval.payload;
  return (
    <div className="reason-box">
      <ShieldCheck size={18} />
      <div>
        <h3>
          Exact proposed {approval.action === 'update_targeting' ? 'targeting' : 'creative'} change
        </h3>
        <p>Experiment: {p.experimentLabel}</p>
        {approval.action === 'update_targeting' ? (
          <>
            <p>Regions: {p.locations.join(', ')}</p>
            <p>
              Age range: {p.ageMin}–{p.ageMax} · Bangladesh only · Meta
            </p>
          </>
        ) : (
          <>
            <p>Ad: {p.adId}</p>
            <p>
              <strong>{p.creative.hook}</strong>
            </p>
            <p>{p.creative.primaryText}</p>
            <p>
              Headline: {p.creative.headline} · CTA: {p.creative.cta} · {p.creative.language}
            </p>
            <p>Concept: {p.creative.concept}</p>
            {p.creative.imageUrl && (
              <a href={p.creative.imageUrl} target="_blank" rel="noreferrer">
                Review proposed creative image
              </a>
            )}
          </>
        )}
        <p>
          The original plan below provides the baseline; this payload is the change being approved.
        </p>
      </div>
    </div>
  );
}

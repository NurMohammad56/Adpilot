import React, { useState } from 'react';
import { Copy, Download, ExternalLink } from 'lucide-react';
import { manualGuide } from '../src/modules/campaigns/manual-guide.js';
import { FieldHelp } from './FieldHelp.jsx';
import { mediaUrl } from './api.js';
import { useLanguage } from './i18n.js';
import { useDraft } from './use-draft.js';
import './manual-guide.css';

export function LaunchModePicker({ value, onChange, disabled }) {
  const bn = useLanguage() === 'bn';
  return (
    <fieldset className="launch-mode-picker" disabled={disabled}>
      <legend>{bn ? 'কীভাবে বিজ্ঞাপন তৈরি করবেন?' : 'How will you create this campaign?'}</legend>
      <label className={value === 'manual' ? 'selected' : ''}>
        <input
          type="radio"
          name="launchMode"
          value="manual"
          checked={value === 'manual'}
          onChange={() => onChange('manual')}
        />
        <span>
          <strong>{bn ? 'সহজ গাইড দেখে নিজে তৈরি করুন' : 'Manual guided launch'}</strong>
          <small>
            {bn
              ? 'Recommended: Facebook Ads Manager-এ নিজে তৈরি করুন। App publish ছাড়াই guide ব্যবহার করা যায়।'
              : 'Recommended: follow the guide in Facebook Ads Manager. The guide does not require app publication.'}
          </small>
        </span>
      </label>
      <label className={value === 'direct' ? 'selected' : ''}>
        <input
          type="radio"
          name="launchMode"
          value="direct"
          checked={value === 'direct'}
          onChange={() => onChange('direct')}
        />
        <span>
          <strong>{bn ? 'AdPilot থেকে সরাসরি চালু করুন' : 'Direct launch from AdPilot'}</strong>
          <small>
            {bn
              ? 'Meta readiness check সফল এবং exact plan অনুমোদিত হলেই API দিয়ে চালু হবে।'
              : 'API launch requires a successful Meta readiness check and approval of the exact plan.'}
          </small>
        </span>
      </label>
    </fieldset>
  );
}

export function ManualCampaignGuide({ plan, approval, data, busy, link }) {
  const bn = useLanguage() === 'bn',
    l = (en, bangla) => (bn ? bangla : en);
  const guide = manualGuide(plan, data.integration);
  const record = (data.manualCampaigns || []).find((r) => r.planId === plan.id);
  const [campaignId, setCampaignId] = useDraft(
    `manual-campaign:${data.business.id}:${plan.id}`,
    '',
  );
  const [message, setMessage] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const approved = approval?.action === 'manual_campaign' && approval.status === 'approved';
  const fresh = approved && (record || Date.parse(approval.expiresAt) > Date.now());
  const text = [
    plan.name,
    `Plan ${plan.id} · ${plan.fingerprint}`,
    `Research ${guide.researchVersionId || 'Product research'}`,
    ...guide.sections.flatMap((s) => [
      s.title,
      ...s.fields.map((f) => `${f.label}: ${f.value}\n${bn ? f.bn : f.help}`),
    ]),
    ...guide.creatives.flatMap((ad, i) => [
      `Ad ${i + 1}`,
      `Headline: ${ad.headline}`,
      `Primary text: ${ad.primaryText}`,
      `CTA: ${ad.cta}`,
      `Media: ${ad.mediaAssetId || ad.imageUrl || 'Required'}`,
    ]),
    guide.unknowns,
  ].join('\n\n');
  async function copy(value) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(
        l(
          'Copied. Paste it into Facebook Ads Manager.',
          'কপি হয়েছে। Facebook Ads Manager-এ পেস্ট করুন।',
        ),
      );
    } catch {
      setMessage(
        l(
          'Copy is unavailable. Select and copy the displayed value.',
          'Copy কাজ করছে না। দেখানো লেখা select করে কপি করুন।',
        ),
      );
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `adpilot-guide-${plan.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="manual-guide" aria-label="Manual campaign guide">
      <div className="notice">
        <div>
          <strong>
            {approved
              ? l(
                  'Approved guide — create it yourself in Facebook',
                  'অনুমোদিত গাইড — Facebook-এ নিজে তৈরি করুন',
                )
              : l(
                  'Guide preview — review and approve before spending',
                  'গাইড preview — খরচ করার আগে review ও approve করুন',
                )}
          </strong>
          <p>
            {l(
              'Approving this guide does not create, publish or activate ads. Follow the steps below; you make the final Publish decision in Facebook.',
              'এই guide approve করলে কোনো ad তৈরি বা চালু হবে না। নিচের ধাপ মেনে Facebook-এ তৈরি করুন; সেখানে Publish-এর সিদ্ধান্ত আপনি নেবেন।',
            )}
          </p>
          <p>
            {l(
              'Keep one campaign and one ad set. Use only the reviewed budget and creatives. If Meta asks for a higher minimum or different settings, stop and edit a new plan version.',
              'একটি campaign ও একটি ad set রাখুন। শুধু reviewed budget ও creative ব্যবহার করুন। Meta বেশি minimum budget বা ভিন্ন setting চাইলে থেমে নতুন plan version edit করুন।',
            )}
          </p>
        </div>
      </div>
      <div className="guide-toolbar">
        <button type="button" className="button secondary" onClick={() => copy(text)}>
          <Copy size={16} />
          {l('Copy complete guide', 'পুরো গাইড কপি করুন')}
        </button>
        <button type="button" className="button secondary" onClick={download}>
          <Download size={16} />
          {l('Download guide', 'গাইড ডাউনলোড')}
        </button>
        {fresh && (
          <a className="button primary" href={guide.adsManagerUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            {l('Open Facebook Ads Manager', 'Facebook Ads Manager খুলুন')}
          </a>
        )}
      </div>
      <div className="guide-budget-summary">
        <div>
          <span>{l('Total ad budget', 'মোট বিজ্ঞাপন বাজেট')}</span>
          <strong>
            {Number(plan.budgetRecommendation.totalBudget).toFixed(2)} {guide.currency}
          </strong>
        </div>
        <div>
          <span>{l('Daily planning average', 'দৈনিক গড় পরিকল্পনা')}</span>
          <strong>
            {Number(plan.budgetRecommendation.dailyBudget).toFixed(2)} {guide.currency}
          </strong>
        </div>
        <div>
          <span>{l('Test duration', 'Test চলবে')}</span>
          <strong>
            {plan.budgetRecommendation.durationDays} {l('days', 'দিন')}
          </strong>
        </div>
      </div>
      <p>
        {l(
          'The daily average is already included in the total; do not add it again. Tax and payment fees are extra.',
          'দৈনিক গড় খরচ মোট বাজেটের মধ্যেই আছে—আবার যোগ করবেন না। Tax ও payment fee আলাদা।',
        )}
      </p>
      <p role="status" className="guide-copy-status">
        {message}
      </p>
      <div className="guide-buyer">
        <strong>{l('Who this ad is for', 'এই বিজ্ঞাপন কাদের জন্য')}</strong>
        <p>{guide.buyer}</p>
      </div>
      {guide.sections.map((section, index) => (
        <details className="guide-step" open={index === 0} key={section.title}>
          <summary>
            <span className="guide-number">{index + 1}</span>
            {section.title}
            <small>{l('Use these fields in Facebook', 'Facebook-এ এই fieldগুলো দিন')}</small>
          </summary>
          {section.fields.map((field) => (
            <div className="guide-field" key={field.label}>
              <div className="guide-field-label">
                <strong>{field.label}</strong>
                <FieldHelp label={field.label} text={bn ? field.bn : field.help} />
              </div>
              <div className="guide-value">
                <span>{field.value}</span>
                <button
                  type="button"
                  className="button secondary"
                  aria-label={`Copy ${field.label}`}
                  onClick={() => copy(field.copyValue)}
                >
                  <Copy size={15} />
                  {l('Copy', 'কপি')}
                </button>
              </div>
              <p>{bn ? field.bn : field.help}</p>
            </div>
          ))}
        </details>
      ))}
      <h3>{l('Your reviewed creatives', 'আপনার reviewed creativeগুলো')}</h3>
      <p>
        {l(
          `Create ${guide.creatives.length} ads inside the same ad set; they share its total budget. To use fewer or different creatives, edit and approve a new version first.`,
          `একই ad set-এর মধ্যে ${guide.creatives.length}টি ad তৈরি করুন; তারা একই মোট বাজেট ভাগ করে ব্যবহার করবে। কম বা ভিন্ন creative চাইলে আগে নতুন version edit ও approve করুন।`,
        )}
      </p>
      {guide.creatives.map((ad, i) => (
        <article className="guide-creative" key={ad.id}>
          <h4>
            {l('Ad', 'বিজ্ঞাপন')} {i + 1}
          </h4>
          {ad.mediaAssetId &&
            (ad.mediaType === 'video' ? (
              <video src={mediaUrl(ad.mediaAssetId)} controls preload="metadata" />
            ) : (
              <img src={mediaUrl(ad.mediaAssetId)} alt={ad.headline} loading="lazy" />
            ))}
          {ad.mediaAssetId && (
            <a
              className="button secondary"
              href={mediaUrl(ad.mediaAssetId)}
              download
              target="_blank"
              rel="noreferrer"
            >
              {l('Download / open creative', 'Creative download / খুলুন')}
            </a>
          )}
          {ad.thumbnailAssetId && (
            <a
              className="button secondary"
              href={mediaUrl(ad.thumbnailAssetId)}
              download
              target="_blank"
              rel="noreferrer"
            >
              {l('Download video cover', 'Video cover download')}
            </a>
          )}
          {!ad.mediaAssetId && ad.imageUrl && (
            <a href={ad.imageUrl} target="_blank" rel="noreferrer">
              {l('Open image', 'ইমেজ খুলুন')}
            </a>
          )}
          {[
            ['Primary text', ad.primaryText],
            ['Headline', ad.headline],
            ['Call to action', ad.cta.replaceAll('_', ' ')],
          ].map(([label, value]) => (
            <div className="guide-field" key={label}>
              <strong>{label}</strong>
              <div className="guide-value">
                <span>{value}</span>
                <button
                  type="button"
                  className="button secondary"
                  aria-label={`Copy ${label} for ad ${i + 1}`}
                  onClick={() => copy(value)}
                >
                  <Copy size={15} />
                  {l('Copy', 'কপি')}
                </button>
              </div>
            </div>
          ))}
        </article>
      ))}
      <div className="notice">
        <div>
          <strong>
            {l('Before clicking Publish in Facebook', 'Facebook-এ Publish দেওয়ার আগে')}
          </strong>
          <ul>
            <li>
              {l(
                'Confirm account, Page, country/regions and exact budget. Check the account timezone and end date.',
                'Account, Page, দেশ/region ও exact budget মিলিয়ে নিন। Account timezone ও end date পরীক্ষা করুন।',
              )}
            </li>
            <li>
              {l(
                'Preview each placement on mobile. Test the landing page, form/checkout and real Pixel event. If tracking is missing, finish it before launch.',
                'Mobile-এ প্রতিটি placement preview করুন। Landing page, form/checkout ও আসল Pixel event পরীক্ষা করুন। Tracking না থাকলে আগে সেটি শেষ করুন।',
              )}
            </li>
            <li>
              {l(
                'Check your billing/payment readiness. Meta review, policy and account eligibility still apply to a manually created ad.',
                'Billing/payment ready আছে কি না দেখুন। Manual ad-এও Meta review, policy ও account eligibility প্রযোজ্য।',
              )}
            </li>
            <li>
              {l(
                'Leads, purchases, CPA and profit are unknown until measured. Start with the capped test; do not increase spending without review.',
                'পরিমাপের আগে lead, purchase, CPA ও profit অজানা। সীমিত test দিয়ে শুরু করুন; review ছাড়া খরচ বাড়াবেন না।',
              )}
            </li>
          </ul>
        </div>
      </div>
      {approved && (
        <section className="guide-link">
          <h3>{l('After creating it in Facebook', 'Facebook-এ তৈরি করার পরে')}</h3>
          <p>
            {l(
              'Select the campaign in Ads Manager and copy its Campaign ID (not ad set or ad ID). Saving here only links and reads it; no status or budget is changed.',
              'Ads Manager-এ campaign নির্বাচন করে Campaign ID কপি করুন—ad set বা ad ID নয়। এখানে save করলে শুধু link ও read হবে; status বা budget বদলাবে না।',
            )}
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const saved = await link(
                approval,
                correcting ? campaignId : record?.metaCampaignId || campaignId,
                correcting,
              );
              if (saved) setCorrecting(false);
            }}
          >
            <label htmlFor={`manual-id-${plan.id}`}>
              {l('Meta Campaign ID', 'Meta Campaign ID')}
            </label>
            <input
              id={`manual-id-${plan.id}`}
              value={correcting ? campaignId : record?.metaCampaignId || campaignId}
              onChange={(e) => setCampaignId(e.target.value)}
              inputMode="numeric"
              pattern="[0-9]{5,30}"
              required
              readOnly={!!record && !correcting}
              placeholder="123456789012345"
            />
            <button className="button primary" disabled={busy || !fresh}>
              {record
                ? l('Recheck Facebook settings', 'Facebook setting আবার যাচাই করুন')
                : l('Save ID & check settings', 'ID save ও setting যাচাই করুন')}
            </button>
          </form>
          {record?.verification.status === 'unverified' && !correcting && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setCampaignId(record.metaCampaignId);
                setCorrecting(true);
              }}
            >
              {l('Correct an unverified Campaign ID', 'ভুল হলে unverified Campaign ID ঠিক করুন')}
            </button>
          )}
          {!fresh && (
            <p role="alert">
              {l(
                'This approval has expired. Prepare a new plan version for a new manual launch.',
                'অনুমোদনের মেয়াদ শেষ। নতুন manual launch-এর জন্য নতুন plan version তৈরি করুন।',
              )}
            </p>
          )}
          {record && (
            <div className="manual-verification" role="status">
              <strong>
                {record.verification.status === 'settings_match'
                  ? l(
                      'Readable settings match — finish the manual checks below',
                      'Read করা setting মিলে গেছে — নিচের manual checkগুলো শেষ করুন',
                    )
                  : record.verification.status === 'mismatch'
                    ? l(
                        'Settings differ from the approved plan',
                        'Setting approved plan-এর সঙ্গে মিলছে না',
                      )
                    : l(
                        'ID saved; Meta verification is incomplete',
                        'ID save হয়েছে; Meta verification অসম্পূর্ণ',
                      )}
              </strong>
              <p>
                {l('Meta status', 'Meta status')}:{' '}
                {record.verification.effectiveStatus || l('Unknown', 'অজানা')} ·{' '}
                {new Date(record.verification.checkedAt).toLocaleString(bn ? 'bn-BD' : 'en-GB')}
              </p>
              <ul>
                {record.verification.checks
                  .filter((c) => !c.matches)
                  .map((c, i) => (
                    <li key={i}>
                      {c.field}: {l('expected', 'প্রত্যাশিত')} {JSON.stringify(c.expected)};{' '}
                      {l('actual', 'আসল')} {JSON.stringify(c.actual)}
                    </li>
                  ))}
                {record.verification.pending.map((p, i) => (
                  <li key={`pending-${i}`}>{p}</li>
                ))}
              </ul>
              {record.verification.insights && (
                <div className="guide-metrics">
                  <strong>
                    {l('Actual Meta delivery — last 30 days', 'Meta-এর আসল delivery — শেষ ৩০ দিন')}
                  </strong>
                  <dl>
                    {[
                      ['Spend', `${record.verification.insights.spend} ${guide.currency}`],
                      ['Impressions', record.verification.insights.impressions],
                      ['Clicks', record.verification.insights.clicks],
                      ['Attributed leads', record.verification.insights.leads],
                      ['Attributed purchases', record.verification.insights.purchases],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    {l(
                      'Platform attribution is not proof of qualified leads, delivered orders or profit.',
                      'Platform attribution দিয়ে qualified lead, delivered order বা profit নিশ্চিত হয় না।',
                    )}
                  </p>
                </div>
              )}
              {record.verification.insightsIssue && <p>{record.verification.insightsIssue}</p>}
              <a
                href={`${guide.adsManagerUrl}&selected_campaign_ids=${record.metaCampaignId}`}
                target="_blank"
                rel="noreferrer"
              >
                {l('Open linked campaign', 'Linked campaign খুলুন')}
              </a>
            </div>
          )}
        </section>
      )}
      <small>
        {l(
          'Research and campaign context stays in this workspace. This guide uses the approved plan without a new AI request.',
          'Research ও campaign context এই workspace-এ থাকবে। নতুন AI request ছাড়াই approved plan থেকে এই guide তৈরি হয়েছে।',
        )}
      </small>
    </section>
  );
}

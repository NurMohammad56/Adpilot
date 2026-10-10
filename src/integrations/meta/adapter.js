import crypto from 'node:crypto';
import { regionalGeo } from '../../modules/research/locations.js';
import { AppError, assert, id, money, unseal } from '../../utils/core.js';
function metaGeo(locations, integration) {
  if (locations.includes('Nationwide')) return { countries: ['BD'] };
  const geo = { regions: [], cities: [] };
  for (const name of locations) {
    const location = integration.locationMap?.[name];
    assert(
      location?.country_code === 'BD' && ['city', 'region'].includes(location.type),
      422,
      'LOCATION_UNVERIFIED',
      'Meta location key has not been verified for Bangladesh',
    );
    geo[location.type === 'city' ? 'cities' : 'regions'].push({ key: location.key });
  }
  if (!geo.regions.length) delete geo.regions;
  if (!geo.cities.length) delete geo.cities;
  return geo;
}

export class DemoMetaAdapter {
  async preflight() {
    return { demo: true, stories: [], assetSteps: [] };
  }
  async accountSnapshot() {
    return {
      demo: true,
      account: { id: 'demo-account', name: 'Demo account', currency: 'BDT', account_status: 1 },
      campaigns: [],
      adSets: [],
      ads: [],
      regions: [],
      truncated: false,
      note: 'Simulated account. No live performance or billing data is available.',
    };
  }
  constructor() {
    this.calls = [];
  }
  async verify() {
    return {
      currency: 'BDT',
      timezone: 'Asia/Dhaka',
      name: 'Demo Bangladesh account',
      accountStatus: 1,
    };
  }
  async request(method, resource, payload) {
    this.calls.push({ method, resource, payload });
    return { id: `demo_${resource.replaceAll('/', '_')}_${id()}`, success: true };
  }
  async launch(plan, integration, onStep) {
    const lifetime = plan.budgetRecommendation.deliveryMode === 'lifetime';
    const campaign = await this.request('POST', 'campaigns', {
      name: plan.name,
      status: 'PAUSED',
      ...(!lifetime ? { spend_cap: Math.round(plan.budgetRecommendation.totalBudget * 100) } : {}),
    });
    await onStep('campaign', campaign.id);
    const adset = await this.request('POST', 'adsets', {
      campaign_id: campaign.id,
      ...(lifetime
        ? { lifetime_budget: Math.round(plan.budgetRecommendation.totalBudget * 100) }
        : { daily_budget: Math.round(plan.budgetRecommendation.dailyBudget * 100) }),
      status: 'PAUSED',
    });
    await onStep('adset', adset.id);
    const ads = [];
    for (const ad of plan.ads) {
      const creative = await this.request('POST', 'adcreatives', ad);
      await onStep(`creative:${ad.id}`, creative.id);
      const created = await this.request('POST', 'ads', {
        adset_id: adset.id,
        creative_id: creative.id,
        status: 'PAUSED',
      });
      await onStep(`ad:${ad.id}`, created.id);
      ads.push(created.id);
    }
    for (const adId of ads) await this.request('POST', adId, { status: 'ACTIVE' });
    await this.request('POST', adset.id, { status: 'ACTIVE' });
    await this.request('POST', campaign.id, { status: 'ACTIVE' });
    return { campaignId: campaign.id, adSetId: adset.id, demo: true };
  }
  async action(campaign, action, payload, integration, plan, onCreative) {
    if (action === 'replace_creative') {
      const creative = await this.request('POST', 'adcreatives', payload.creative);
      await onCreative(creative.id);
      await this.request('POST', payload.metaAdId, { creative: { creative_id: creative.id } });
      return { success: true, creativeId: creative.id };
    }
    if (action === 'update_targeting')
      return this.request('POST', campaign.metaAdSetId, { targeting: payload });
    return this.request(
      'POST',
      action === 'update_budget' ? campaign.metaAdSetId : campaign.metaCampaignId,
      action === 'update_budget'
        ? { daily_budget: Math.round(payload.dailyBudget * 100) }
        : { status: action === 'pause_campaign' ? 'PAUSED' : 'ACTIVE' },
    );
  }
  async insights(campaign, plan) {
    const days = Math.min(plan.budgetRecommendation.durationDays, 7);
    const campaignRows = Array.from({ length: days }, (_, i) => {
      const date = new Date(Date.now() - (days - 1 - i) * 86400000).toLocaleDateString('en-CA', {
        timeZone: 'Asia/Dhaka',
      });
      const spend = money(campaign.dailyBudget * (0.72 + i * 0.025));
      const conversions = Math.max(
        1,
        Math.floor(
          spend / ((plan.pricingRecommendation.targetCPA || campaign.dailyBudget * 0.4) * 0.72),
        ),
      );
      return {
        date,
        level: 'campaign',
        entityId: campaign.id,
        spend,
        impressions: Math.floor(spend * 30),
        reach: Math.floor(spend * 21),
        clicks: Math.floor(spend * 0.6),
        conversions,
        revenue:
          plan.conversionEvent === 'LEAD' || plan.pricingRecommendation.sellingPrice === null
            ? null
            : money(conversions * plan.pricingRecommendation.sellingPrice),
        conversionEvent: plan.conversionEvent,
        revenueSource: 'Simulated demo revenue',
        demo: true,
      };
    });
    const adKeys = Object.keys(campaign.steps || {}).filter((key) => key.startsWith('ad:'));
    return campaignRows.flatMap((row) => [
      row,
      { ...row, level: 'adset', entityId: campaign.metaAdSetId },
      ...adKeys.map((key, index) => {
        const divide = (field) => {
          const base = Math.floor(row[field] / adKeys.length);
          return base + (index < Math.round(row[field] - base * adKeys.length) ? 1 : 0);
        };
        const conversions = divide('conversions');
        return {
          ...row,
          level: 'ad',
          entityId: campaign.steps[key],
          spend: money(row.spend / adKeys.length),
          impressions: divide('impressions'),
          reach: divide('reach'),
          clicks: divide('clicks'),
          conversions,
          revenue:
            row.revenue === null
              ? null
              : money(conversions * plan.pricingRecommendation.sellingPrice),
        };
      }),
    ]);
  }
  async targetingSearch(query, type, integration, country = 'BD') {
    return [
      {
        key: `demo-${country}-${type}-${query.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        name: query || 'Dhaka',
        type,
        country_code: country,
        demo: true,
      },
    ];
  }
}

export class LiveMetaAdapter {
  async accountSnapshot(integration) {
    const accountId = `act_${integration.adAccountId}`;
    const account = await this.request(integration, 'GET', accountId, {
      fields:
        'id,name,currency,timezone_name,account_status,disable_reason,amount_spent,balance,spend_cap',
    });
    let truncated = false;
    const pages = async (edge, fields, extra = {}) => {
      const rows = [];
      let after;
      const seen = new Set();
      for (let page = 0; page < 5; page++) {
        const response = await this.request(integration, 'GET', `${accountId}/${edge}`, {
          fields,
          limit: 100,
          ...extra,
          ...(after ? { after } : {}),
        });
        rows.push(...(response.data || []));
        const hasNext = Boolean(response.paging?.next);
        after = hasNext ? response.paging?.cursors?.after : null;
        if (hasNext && (!after || seen.has(after))) {
          truncated = true;
          break;
        }
        if (after) seen.add(after);
        if (!after) break;
        if (page === 4) truncated = true;
      }
      return rows;
    };
    const inventory = await Promise.allSettled([
      pages(
        'campaigns',
        'id,name,objective,status,effective_status,daily_budget,lifetime_budget,spend_cap,start_time,stop_time',
      ),
      pages(
        'adsets',
        'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,targeting',
      ),
      pages('ads', 'id,name,campaign_id,adset_id,status,effective_status,ad_review_feedback'),
    ]);
    const [campaigns, adSets, ads] = inventory.map((result) =>
      result.status === 'fulfilled' ? result.value : [],
    );
    const inventoryErrors = Object.fromEntries(
      ['campaigns', 'adSets', 'ads'].flatMap((edge, index) =>
        inventory[index].status === 'rejected'
          ? [[edge, inventory[index].reason.code || 'META_UNAVAILABLE']]
          : [],
      ),
    );
    let regionalError = null;
    let regions = [];
    try {
      regions = await pages(
        'insights',
        'date_start,date_stop,campaign_id,campaign_name,spend,impressions,clicks',
        { level: 'campaign', date_preset: 'last_30d', breakdowns: 'country,region' },
      );
    } catch (error) {
      // A permissions or privacy restriction must not hide the successfully checked account.
      regionalError = error.code || 'REGIONAL_DATA_UNAVAILABLE';
    }
    return {
      account,
      campaigns,
      adSets,
      ads,
      regions,
      regionalError,
      inventoryErrors,
      truncated,
      demo: false,
      note: 'Meta-reported account inventory and regional delivery for the last 30 days. Regional clicks/spend do not establish profitability. Account balances/budgets are in minor currency units.',
    };
  }
  constructor(config) {
    this.config = config;
  }
  async request(integration, method, resource, payload = {}) {
    const token = unseal(integration.encryptedToken, this.config.encryptionKey);
    const url = new URL(`https://graph.facebook.com/${this.config.metaVersion}/${resource}`);
    const appSecret = integration.encryptedAppSecret
      ? unseal(integration.encryptedAppSecret, this.config.encryptionKey)
      : integration.legacyInstanceApp
        ? this.config.metaAppSecret
        : null;
    if (appSecret)
      url.searchParams.set(
        'appsecret_proof',
        crypto.createHmac('sha256', appSecret).update(token).digest('hex'),
      );
    const body = payload instanceof FormData ? payload : new URLSearchParams();
    for (const [key, value] of payload instanceof FormData ? [] : Object.entries(payload)) {
      const encoded = typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (method === 'GET') url.searchParams.set(key, encoded);
      else body.set(key, encoded);
    }
    // Never retry mutations automatically: a timed-out POST may have succeeded remotely.
    for (let attempt = 0; attempt < (method === 'GET' ? 3 : 1); attempt++) {
      let response;
      try {
        response = await fetch(url, {
          method,
          headers: { authorization: `Bearer ${token}` },
          ...(method === 'GET' ? {} : { body }),
          signal: AbortSignal.timeout(30000),
        });
      } catch {
        throw new AppError(
          502,
          method === 'GET' ? 'META_UNAVAILABLE' : 'META_AMBIGUOUS',
          method === 'GET'
            ? 'Meta is unavailable'
            : 'Meta action outcome is uncertain. Reconcile before retrying.',
        );
      }
      let data;
      try {
        data = await response.json();
      } catch {
        throw new AppError(
          502,
          method === 'GET' ? 'META_UNAVAILABLE' : 'META_AMBIGUOUS',
          'Meta returned an unreadable response. Check the remote outcome before retrying.',
        );
      }
      if (!response.ok || data.error) {
        if (method === 'GET' && [429, 500, 502, 503].includes(response.status) && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 500));
          continue;
        }
        const sanitize = (value) => {
          let text = typeof value === 'string' ? value : '';
          for (const secret of [token, appSecret].filter(Boolean))
            text = text.replaceAll(secret, '[REDACTED]');
          return text
            .replace(
              /(?:EA[A-Za-z0-9_-]{30,}|sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{25,})/g,
              '[REDACTED]',
            )
            .replace(
              /(?:access_token|appsecret_proof|client_secret)\s*[=:]\s*[^\s&]+/gi,
              '[REDACTED]',
            )
            .slice(0, 700);
        };
        const userMessage = sanitize(data.error?.error_user_msg);
        const title = sanitize(data.error?.error_user_title);
        const rejected =
          response.status >= 400 &&
          response.status < 500 &&
          Number.isFinite(data.error?.code) &&
          ![1, 2].includes(data.error.code) &&
          !data.error.is_transient;
        throw new AppError(502, 'META_REJECTED', userMessage || 'Meta rejected the request', {
          metaCode: data.error?.code,
          subcode: data.error?.error_subcode,
          traceId: data.error?.fbtrace_id,
          title,
          userMessage,
          outcome: rejected ? 'rejected' : 'uncertain',
          operation: `${method} ${['campaigns', 'adsets', 'ads', 'adcreatives', 'adimages', 'advideos'].find((edge) => resource.endsWith('/' + edge)) || 'object'}`,
        });
      }
      return data;
    }
  }
  async verify(integration) {
    const verifyRead = async (field, resource, payload) => {
      try {
        return await this.request(integration, 'GET', resource, payload);
      } catch (error) {
        if (error.code !== 'META_REJECTED') throw error;
        const tokenError = error.details?.metaCode === 190;
        const message = tokenError
          ? 'Meta access token is invalid or expired. Paste a fresh token with access to your assets.'
          : field === 'adAccountId'
            ? 'Meta cannot access this ad account. Check its numeric ID and token permissions.'
            : field === 'pageId'
              ? 'Meta cannot access this Facebook Page. Use the Page ID, not the App ID, and check token permissions.'
              : 'Meta cannot read pixels for this ad account. Check dataset access and token permissions.';
        throw new AppError(422, 'META_CONNECTION', message, {
          fieldErrors: { [tokenError ? 'accessToken' : field]: [message] },
          metaCode: error.details?.metaCode,
        });
      }
    };
    const account = await verifyRead('adAccountId', `act_${integration.adAccountId}`, {
      fields: 'id,name,currency,timezone_name,account_status',
    });
    assert(
      [
        'BDT',
        'USD',
        'GBP',
        'EUR',
        'CAD',
        'AUD',
        'AED',
        'INR',
        'SGD',
        'SAR',
        'MYR',
        'NZD',
        'SEK',
        'NOK',
        'DKK',
        'QAR',
      ].includes(account.currency),
      422,
      'CURRENCY_MISMATCH',
      'This account currency is unsupported. Use a supported currency with two decimal minor units.',
    );
    assert(account.account_status === 1, 422, 'ACCOUNT_INACTIVE', 'Meta ad account is not active');
    const page = await verifyRead('pageId', integration.pageId, { fields: 'id,name' });
    const pixels = await verifyRead('pixelId', `act_${integration.adAccountId}/adspixels`, {
      fields: 'id,name',
    });
    assert(
      pixels.data?.some((p) => p.id === integration.pixelId),
      422,
      'PIXEL_ACCESS',
      'Pixel is not accessible through this ad account',
    );
    return {
      currency: account.currency,
      timezone: account.timezone_name,
      name: account.name,
      pageName: page.name,
      accountStatus: account.account_status,
    };
  }
  async inspectManualCampaign(campaignId, integration) {
    assert(
      /^\d{5,30}$/.test(campaignId),
      422,
      'MANUAL_ID_INVALID',
      'Enter a numeric Meta Campaign ID.',
    );
    const campaign = await this.request(integration, 'GET', campaignId, {
      fields: 'id,name,account_id,objective,status,effective_status,daily_budget,lifetime_budget',
    });
    assert(
      String(campaign.account_id) === integration.adAccountId,
      422,
      'MANUAL_ACCOUNT_MISMATCH',
      'This campaign belongs to a different ad account. Select the campaign from this workspace account.',
    );
    const pages = async (edge, fields, parameters = {}) => {
      const rows = [],
        seen = new Set();
      let after;
      for (let page = 0; page < 10; page++) {
        const result = await this.request(integration, 'GET', `${campaignId}/${edge}`, {
          fields,
          limit: 100,
          ...parameters,
          ...(after ? { after } : {}),
        });
        assert(
          Array.isArray(result.data),
          502,
          'MANUAL_READ_INCOMPLETE',
          'Meta returned incomplete campaign settings.',
        );
        rows.push(...result.data);
        if (!result.paging?.next) return rows;
        after = result.paging?.cursors?.after;
        assert(
          after && !seen.has(after),
          502,
          'MANUAL_READ_INCOMPLETE',
          'Campaign pagination did not advance. No full verification was recorded.',
        );
        seen.add(after);
      }
      throw new AppError(
        502,
        'MANUAL_READ_INCOMPLETE',
        'Campaign pagination exceeded its safety limit. No full verification was recorded.',
      );
    };
    const [account, adSets, ads] = await Promise.all([
      this.request(integration, 'GET', `act_${integration.adAccountId}`, { fields: 'id,currency' }),
      pages(
        'adsets',
        'id,name,status,effective_status,daily_budget,lifetime_budget,start_time,end_time,optimization_goal,promoted_object,targeting',
      ),
      pages('ads', 'id,name,status,effective_status,creative{object_story_spec}'),
    ]);
    let insights = null,
      insightsIssue = null;
    try {
      const rows = await pages(
        'insights',
        'date_start,date_stop,spend,impressions,clicks,actions',
        { date_preset: 'last_30d' },
      );
      if (rows.length) {
        const metric = (field) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
        const event = (type) =>
          rows.reduce(
            (sum, row) =>
              sum +
              Number(
                (row.actions || []).find((a) => a.action_type === type)?.value ||
                  (row.actions || []).find(
                    (a) => a.action_type === `offsite_conversion.fb_pixel_${type}`,
                  )?.value ||
                  0,
              ),
            0,
          );
        insights = {
          period: 'last_30d',
          from: rows[0].date_start,
          to: rows.at(-1).date_stop,
          spend: metric('spend'),
          impressions: metric('impressions'),
          clicks: metric('clicks'),
          leads: event('lead'),
          purchases: event('purchase'),
          source: 'Meta attributed; not confirmed orders or revenue',
        };
        assert(
          Object.values(insights)
            .filter((v) => typeof v === 'number')
            .every(Number.isFinite),
          502,
          'MANUAL_READ_INCOMPLETE',
          'Meta returned invalid insight values.',
        );
      } else insightsIssue = 'No Meta delivery insights were returned for the last 30 days.';
    } catch (error) {
      if (!['META_REJECTED', 'META_AMBIGUOUS', 'MANUAL_READ_INCOMPLETE'].includes(error.code))
        throw error;
      insights = null;
      insightsIssue = error.message;
    }
    return { campaign, account, adSets, ads, insights, insightsIssue };
  }
  campaignPayload(plan) {
    const budget = plan.budgetRecommendation;
    return {
      name: plan.name,
      objective: plan.objective,
      special_ad_categories: [],
      status: 'PAUSED',
      ...(budget.deliveryMode !== 'lifetime'
        ? { spend_cap: Math.round(budget.totalBudget * 100) }
        : {}),
      is_adset_budget_sharing_enabled: false,
    };
  }
  async preflight(plan, integration, onAsset = async () => {}) {
    try {
      await this.verify(integration);
    } catch (error) {
      error.details = { ...error.details, noRemoteMutation: true };
      throw error;
    }
    const act = `act_${integration.adAccountId}`;
    // Meta validates campaign limits without creating an object or reserving remote spend.
    try {
      await this.request(integration, 'POST', `${act}/campaigns`, {
        ...this.campaignPayload(plan),
        execution_options: ['validate_only'],
      });
    } catch (error) {
      error.details = { ...error.details, noRemoteMutation: true };
      throw error;
    }
    const stories = [],
      assetSteps = [];
    try {
      for (const ad of plan.ads) {
        const story = await this.creativeStory(ad, plan, integration, async (step, metaId) => {
          assetSteps.push({ step, metaId });
          await onAsset(step, metaId);
        });
        await this.request(integration, 'POST', `${act}/adcreatives`, {
          name: ad.headline,
          object_story_spec: story,
          execution_options: ['validate_only'],
        });
        stories.push(story);
      }
    } catch (error) {
      // Images/videos may have been uploaded, but no campaign, ad set or ad has been created.
      error.details = { ...error.details, noRemoteCampaign: true };
      throw error;
    }
    return { demo: false, stories, assetSteps };
  }
  async launch(plan, integration, onStep) {
    const { stories } = await this.preflight(plan, integration, onStep);
    const act = `act_${integration.adAccountId}`;
    const budget = plan.budgetRecommendation,
      audience = plan.audienceRecommendation;
    const lifetime = budget.deliveryMode === 'lifetime';
    const geo = audience.geoTargets?.length
      ? regionalGeo(audience.geoTargets, plan.market)
      : plan.kind === 'service'
        ? { countries: audience.locations }
        : metaGeo(audience.locations, integration);
    let campaign;
    try {
      campaign = await this.request(
        integration,
        'POST',
        `${act}/campaigns`,
        this.campaignPayload(plan),
      );
    } catch (error) {
      if (error.details?.outcome === 'rejected')
        error.details = { ...error.details, noRemoteCampaign: true };
      throw error;
    }
    assert(
      campaign.id,
      502,
      'META_AMBIGUOUS',
      'Meta did not return a campaign ID. Reconcile before retrying.',
    );
    await onStep('campaign', campaign.id);
    const startTime = new Date(Date.now() + 600000).toISOString();
    const endTime = new Date(Date.parse(startTime) + budget.durationDays * 86400000).toISOString();
    const adsetPayload = {
      name: `${plan.name} · Primary`,
      campaign_id: campaign.id,
      ...(lifetime
        ? { lifetime_budget: Math.round(budget.totalBudget * 100), start_time: startTime }
        : { daily_budget: Math.round(budget.dailyBudget * 100) }),
      end_time: endTime,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      promoted_object: { pixel_id: integration.pixelId, custom_event_type: plan.conversionEvent },
      ...(plan.kind === 'service' ? { destination_type: 'WEBSITE' } : {}),
      targeting: {
        geo_locations: geo,
        age_min: audience.ageMin,
        age_max: audience.ageMax,
        publisher_platforms: ['facebook', 'instagram'],
        device_platforms: ['mobile', 'desktop'],
      },
      status: 'PAUSED',
    };
    await this.request(integration, 'POST', `${act}/adsets`, {
      ...adsetPayload,
      execution_options: ['validate_only'],
    });
    const adset = await this.request(integration, 'POST', `${act}/adsets`, adsetPayload);
    await onStep('adset', adset.id);
    const adIds = [];
    for (const [index, ad] of plan.ads.entries()) {
      const story = stories[index];
      const creative = await this.request(integration, 'POST', `${act}/adcreatives`, {
        name: ad.headline,
        object_story_spec: story,
      });
      await onStep(`creative:${ad.id}`, creative.id);
      const created = await this.request(integration, 'POST', `${act}/ads`, {
        name: ad.hook,
        adset_id: adset.id,
        creative: { creative_id: creative.id },
        status: 'PAUSED',
      });
      await onStep(`ad:${ad.id}`, created.id);
      adIds.push(created.id);
    }
    for (const adId of adIds) await this.request(integration, 'POST', adId, { status: 'ACTIVE' });
    await this.request(integration, 'POST', adset.id, { status: 'ACTIVE' });
    await this.request(integration, 'POST', campaign.id, { status: 'ACTIVE' });
    return { campaignId: campaign.id, adSetId: adset.id, startTime, endTime, demo: false };
  }
  async action(campaign, action, payload, integration, plan, onCreative) {
    assert(
      [
        'update_budget',
        'pause_campaign',
        'resume_campaign',
        'update_targeting',
        'replace_creative',
      ].includes(action),
      422,
      'UNSUPPORTED_ACTION',
      'Unsupported Meta action',
    );
    if (action === 'update_targeting')
      return this.request(integration, 'POST', campaign.metaAdSetId, {
        targeting: {
          geo_locations: payload.geoTargets?.length
            ? regionalGeo(payload.geoTargets, plan.market)
            : plan.kind === 'service'
              ? { countries: payload.locations }
              : metaGeo(payload.locations, integration),
          age_min: payload.ageMin,
          age_max: payload.ageMax,
          publisher_platforms: ['facebook', 'instagram'],
          device_platforms: ['mobile', 'desktop'],
        },
      });
    if (action === 'replace_creative') {
      const ad = payload.creative;
      const story = await this.creativeStory(ad, plan, integration, async (name, remoteId) =>
        onCreative(remoteId, name),
      );
      const creative = await this.request(
        integration,
        'POST',
        `act_${integration.adAccountId}/adcreatives`,
        {
          name: ad.headline,
          object_story_spec: story,
        },
      );
      await onCreative(creative.id);
      await this.request(integration, 'POST', payload.metaAdId, {
        creative: { creative_id: creative.id },
        name: ad.hook,
      });
      return { success: true, creativeId: creative.id };
    }
    if (action === 'update_budget')
      return this.request(integration, 'POST', campaign.metaAdSetId, {
        daily_budget: Math.round(payload.dailyBudget * 100),
      });
    return this.request(integration, 'POST', campaign.metaCampaignId, {
      status: action === 'pause_campaign' ? 'PAUSED' : 'ACTIVE',
    });
  }
  async insights(campaign, plan, integration) {
    const rows = [];
    for (const level of ['campaign', 'adset', 'ad']) {
      let after;
      const seen = new Set();
      let pages = 0;
      do {
        assert(
          ++pages <= 30,
          502,
          'INSIGHTS_INCOMPLETE',
          'Insight pagination reached its limit; incomplete data was not saved',
        );
        const data = await this.request(integration, 'GET', `${campaign.metaCampaignId}/insights`, {
          level,
          fields:
            'date_start,campaign_id,adset_id,ad_id,spend,impressions,reach,clicks,actions,action_values',
          date_preset: 'last_30d',
          time_increment: 1,
          limit: 100,
          ...(after ? { after } : {}),
        });
        for (const row of data.data || []) {
          // Choose one action family; summing overlapping purchase aliases double-counts conversions.
          const event = plan.conversionEvent === 'LEAD' ? 'lead' : 'purchase';
          const purchase =
            row.actions?.find((a) => a.action_type === event) ||
            row.actions?.find((a) => a.action_type === `offsite_conversion.fb_pixel_${event}`);
          const revenue =
            plan.conversionEvent === 'LEAD'
              ? null
              : row.action_values?.find((a) => a.action_type === purchase?.action_type);
          rows.push({
            date: row.date_start,
            level,
            entityId:
              level === 'campaign' ? campaign.id : level === 'adset' ? row.adset_id : row.ad_id,
            spend: Number(row.spend || 0),
            impressions: Number(row.impressions || 0),
            reach: Number(row.reach || 0),
            clicks: Number(row.clicks || 0),
            conversions: Number(purchase?.value || 0),
            conversionEvent: plan.conversionEvent,
            revenue: revenue ? Number(revenue.value) : null,
            revenueSource: revenue
              ? 'Meta-reported attributed purchase value; not confirmed delivered revenue'
              : 'Unavailable',
            demo: false,
          });
        }
        after = data.paging?.next ? data.paging?.cursors?.after : null;
        assert(
          !data.paging?.next || (after && !seen.has(after)),
          502,
          'INSIGHTS_INCOMPLETE',
          'Insight pagination did not advance; incomplete data was not saved',
        );
        if (after) seen.add(after);
      } while (after);
    }
    return rows;
  }
  async targetingSearch(query, type, integration, country = 'BD') {
    const data = await this.request(integration, 'GET', 'search', {
      type: 'adgeolocation',
      location_types: [type],
      q: query,
      country_code: country,
    });
    return (data.data || []).filter((r) => r.country_code === country);
  }
  async creativeStory(ad, plan, integration, onStep) {
    const act = `act_${integration.adAccountId}`;
    const callToAction = { type: ad.cta, value: { link: plan.landingUrl } };
    if (!ad.mediaAssetId)
      return {
        page_id: integration.pageId,
        link_data: {
          link: plan.landingUrl,
          picture: ad.imageUrl,
          message: ad.primaryText,
          name: ad.headline,
          call_to_action: callToAction,
        },
      };
    const { bytes, asset } = await this.media.readBytes(
      plan.businessId,
      ad.mediaAssetId,
      ad.assetChecksum,
    );
    const uploadImage = async (content, assetId) => {
      const result = await this.request(integration, 'POST', `${act}/adimages`, {
        bytes: content.toString('base64'),
      });
      const imageHash = Object.values(result.images || {})[0]?.hash;
      assert(imageHash, 502, 'META_IMAGE', 'Meta did not return an uploaded image hash');
      await onStep(`asset:${assetId}`, imageHash);
      return imageHash;
    };
    if (asset.type === 'image')
      return {
        page_id: integration.pageId,
        link_data: {
          link: plan.landingUrl,
          image_hash: await uploadImage(bytes, asset.id),
          message: ad.primaryText,
          name: ad.headline,
          call_to_action: callToAction,
        },
      };
    const form = new FormData();
    form.set('source', new Blob([bytes], { type: asset.mime }), asset.name);
    form.set('title', ad.headline);
    const video = await this.request(integration, 'POST', `${act}/advideos`, form);
    assert(video.id, 502, 'META_VIDEO', 'Meta did not return an uploaded video ID');
    await onStep(`asset:${asset.id}`, video.id);
    // Video processing can be asynchronous. A non-ready upload is kept checkpointed
    // and requires reconciliation; do not activate an incomplete creative graph.
    let status;
    for (let attempt = 0; attempt < 20; attempt++) {
      status = await this.request(integration, 'GET', video.id, { fields: 'status' });
      if (['ready', 'error'].includes(status.status?.video_status)) break;
      if (attempt < 19) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    assert(
      status.status?.video_status === 'ready',
      409,
      'VIDEO_PROCESSING',
      'Meta video is still processing. Reconcile the checkpointed upload before continuing.',
    );
    const cover = await this.media.readBytes(
      plan.businessId,
      ad.thumbnailAssetId,
      ad.thumbnailChecksum,
    );
    return {
      page_id: integration.pageId,
      video_data: {
        video_id: video.id,
        image_hash: await uploadImage(cover.bytes, cover.asset.id),
        message: ad.primaryText,
        title: ad.headline,
        call_to_action: callToAction,
      },
    };
  }
}

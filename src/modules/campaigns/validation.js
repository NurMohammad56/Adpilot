import { hash } from '../../utils/core.js';
import { regionalGeo } from '../research/locations.js';
export const planFingerprint = (plan) =>
  hash({
    businessId: plan.businessId,
    productId: plan.productId,
    version: plan.version,
    name: plan.name,
    market: plan.market,
    platform: plan.platform,
    objective: plan.objective,
    conversionEvent: plan.conversionEvent,
    pricingRecommendation: plan.pricingRecommendation,
    budgetRecommendation: plan.budgetRecommendation,
    locationRecommendation: plan.locationRecommendation,
    audienceRecommendation: plan.audienceRecommendation,
    ads: plan.ads,
    landingUrl: plan.landingUrl,
    campaignStructure: plan.campaignStructure,
    creativeStrategy: plan.creativeStrategy,
    assumptions: plan.assumptions,
    risks: plan.risks,
    confidence: plan.confidence,
    expectedOutcomes: plan.expectedOutcomes,
    productSnapshotHash: plan.productSnapshotHash,
    businessPolicyHash: plan.businessPolicyHash,
    integrationHash: plan.integrationHash,
    kind: plan.kind,
    researchVersionId: plan.researchVersionId,
    researchProjectId: plan.researchProjectId,
    researchDecisionHash: plan.researchDecisionHash,
    accountCurrency: plan.accountCurrency,
  });
export const businessPolicyHash = (business) =>
  hash({
    dailyBudgetCeiling: business.dailyBudgetCeiling,
    totalBudgetCeiling: business.totalBudgetCeiling,
    deliveryRegions: business.deliveryRegions,
  });
export function validatePlan(
  plan,
  product,
  business,
  config = { mode: 'demo' },
  integration = null,
) {
  const errors = [];
  const warnings = [...plan.pricingRecommendation.risks, ...plan.budgetRecommendation.risks];
  const { budgetRecommendation: b, pricingRecommendation: p, audienceRecommendation: a } = plan;
  const service = plan.kind === 'service';
  if (b.deliveryMode !== undefined && !['daily', 'lifetime'].includes(b.deliveryMode))
    errors.push('Budget delivery mode is invalid.');
  if (
    b.deliveryMode === 'lifetime' &&
    (!Number.isInteger(b.durationDays) ||
      b.durationDays < 1 ||
      b.durationDays > 30 ||
      Math.abs(b.totalBudget - Math.round(b.dailyBudget * b.durationDays * 100) / 100) > 0.005)
  )
    errors.push(
      'Lifetime budget must match the reviewed daily planning average and test duration.',
    );
  if (
    (!service && plan.market !== 'BD') ||
    plan.platform !== 'META' ||
    (!service && (plan.objective !== 'OUTCOME_SALES' || plan.conversionEvent !== 'PURCHASE')) ||
    (service &&
      (!['OUTCOME_LEADS', 'OUTCOME_SALES'].includes(plan.objective) ||
        !['LEAD', 'PURCHASE'].includes(plan.conversionEvent) ||
        (plan.objective === 'OUTCOME_LEADS') !== (plan.conversionEvent === 'LEAD')))
  )
    errors.push(
      service
        ? 'Service plans require a supported Meta website lead or purchase objective.'
        : 'Physical product plans support Bangladesh Meta purchase campaigns.',
    );
  if (
    !p.viable ||
    (p.targetCPA == null ? !(service && p.manualTest && p.acknowledged) : p.targetCPA <= 0)
  )
    errors.push('Product economics are not viable at the selected price.');
  if (
    !Number.isFinite(b.dailyBudget) ||
    b.dailyBudget <= 0 ||
    b.dailyBudget > Math.min(product.dailyBudgetCeiling, business.dailyBudgetCeiling)
  )
    errors.push('Daily budget exceeds a hard ceiling or is invalid.');
  if (
    !Number.isFinite(b.totalBudget) ||
    b.totalBudget <= 0 ||
    b.totalBudget > Math.min(product.testBudgetCeiling, business.totalBudgetCeiling)
  )
    errors.push('Total test budget exceeds a hard ceiling or is invalid.');
  if (a.ageMin > a.ageMax || a.ageMin < 18 || a.ageMax > 65)
    errors.push('Audience age range is invalid.');
  if (a.geoTargets?.length) {
    try {
      regionalGeo(a.geoTargets, plan.market);
    } catch {
      errors.push('Regional targets must be verified and belong to the approved country.');
    }
    if (
      config.mode === 'live' &&
      a.geoTargets.some((target) => target.demo || target.accountId !== integration?.adAccountId)
    )
      errors.push('Regional targets must be verified for the connected live ad account.');
    if (
      !service &&
      a.geoTargets.some((target) => {
        const covered = Object.entries(integration?.locationMap || {}).find(
          ([, entry]) => entry.key === target.key && entry.country_code === 'BD',
        )?.[0];
        return (
          !(
            business.deliveryRegions.includes('Nationwide') ||
            business.deliveryRegions.includes(covered)
          ) ||
          !(
            product.deliveryRegions?.includes('Nationwide') ||
            (product.deliveryRegions || business.deliveryRegions).includes(covered)
          )
        );
      })
    )
      errors.push('Verify regional targets against both business and product delivery coverage.');
  }
  if (
    !a.locations.length ||
    a.locations.some((region) =>
      service
        ? region !== plan.market
        : !business.deliveryRegions.includes(region) &&
          !business.deliveryRegions.includes('Nationwide'),
    )
  )
    errors.push('A location is outside the supported delivery footprint.');
  if (!plan.ads.length) errors.push('At least one creative is required.');
  if (
    !service &&
    product.deliveryRegions &&
    !product.deliveryRegions.includes('Nationwide') &&
    a.locations.some((region) => !product.deliveryRegions.includes(region))
  )
    errors.push('Selected locations are outside this product delivery coverage.');
  if (a.interests.some((i) => !i.id || !i.verifiedAt))
    errors.push('Interest targeting must be resolved through Meta.');
  if (config.mode === 'live') {
    if (!product.landingUrl) errors.push('Live campaigns require an HTTPS landing page.');
    if (plan.ads.some((ad) => !ad.imageUrl && !ad.mediaAssetId))
      errors.push('Each live creative requires an uploaded image/video or an HTTPS image.');
    if (!integration?.configured)
      errors.push('Configure and verify the Meta integration before approval.');
    if (!service && integration?.currency && integration.currency !== 'BDT')
      errors.push('Phase 1 requires a BDT ad account. FX conversion is not implemented.');
    if (service && plan.accountCurrency !== integration?.currency)
      errors.push('Campaign budgets must use the connected account currency.');
    if (
      !service &&
      a.locations.some((region) => region !== 'Nationwide' && !integration?.locationMap?.[region])
    )
      errors.push('Resolve selected regions to verified Meta city/region keys before approval.');
  }
  if (service && !plan.researchVersionId)
    errors.push('Service campaigns require an approved research decision.');
  if (
    plan.ads.some(
      (ad) => ad.mediaType === 'video' && (!ad.thumbnailAssetId || !ad.thumbnailChecksum),
    )
  )
    errors.push('Each uploaded video requires an approved cover image.');
  if (plan.confidence === 'Low')
    warnings.push(
      'Research confidence is low. Recommendations are hypotheses requiring a controlled test.',
    );
  return {
    valid: errors.length === 0,
    errors,
    warnings: [...new Set(warnings)],
    riskLevel: errors.length ? 'High' : warnings.length ? 'Medium' : 'Low',
    checkedAt: new Date().toISOString(),
  };
}

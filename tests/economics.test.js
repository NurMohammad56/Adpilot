import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEconomics } from '../src/modules/pricing/engine.js';
import { recommendBudget } from '../src/modules/budgeting/engine.js';
import { calculateMetrics, aggregatePerformance } from '../src/modules/analytics/engine.js';
import { recommendOptimizations } from '../src/modules/optimization/engine.js';
import { opportunityScore } from '../src/modules/research/service.js';
import { productInput } from './helpers.js';
test('economics deduct costs and required profit before allowing advertising', () => {
  const product = structuredClone(productInput);
  product.sellingPrice = 1000;
  product.minProfit = 320;
  product.desiredMargin = 0;
  const result = calculateEconomics(product);
  assert.equal(result.baseVariableCost, 680);
  assert.equal(result.breakEvenCPA, 320);
  assert.equal(result.targetCPA, 0);
  assert.equal(result.viable, false);
  assert.equal(result.targetROAS, null);
});
test('fees and failed COD orders reduce allowable CPA per delivered order', () => {
  const product = structuredClone(productInput);
  product.costs.returnRate = 0.2;
  product.costs.paymentPercent = 2;
  const result = calculateEconomics(product);
  assert.equal(result.expectedReturnCost, 40);
  assert.equal(result.baseVariableCost, 720);
  assert.equal(result.breakEvenCPA, 750);
  assert.equal(result.targetCPA, 450);
  assert.equal(result.contributionAtTargetCPA, 300);
});
test('budgets stay within product/business limits when ceilings are feasible', () => {
  const product = { ...productInput, dailyBudgetCeiling: 300, testBudgetCeiling: 1200 };
  const result = recommendBudget(
    product,
    { dailyBudgetCeiling: 200, totalBudgetCeiling: 1000 },
    calculateEconomics(product),
  );
  assert.equal(result.dailyBudget, 200);
  assert.equal(result.durationDays, 5);
  assert.equal(result.totalBudget, 1000);
  assert.ok(result.risks.length);
});
test('unknown revenue and zero denominator metrics remain unknown', () => {
  const raw = {
    spend: 100,
    impressions: 1000,
    reach: 500,
    clicks: 10,
    conversions: 0,
    revenue: null,
  };
  const result = calculateMetrics(raw);
  assert.equal(result.cpa, null);
  assert.equal(result.roas, null);
  assert.equal(result.ctr, 1);
  assert.equal(result.frequency, 2);
  const total = aggregatePerformance([raw, { ...raw, revenue: 500 }]);
  assert.equal(total.revenue, null);
  assert.equal(total.roas, null);
  assert.equal(total.reach, null);
  assert.equal(total.frequency, null);
});
test('high CTR does not make a sales campaign a winner without purchase evidence', () => {
  const plan = { pricingRecommendation: { targetCPA: 200 } };
  const campaign = { dailyBudget: 500 };
  assert.deepEqual(
    recommendOptimizations(campaign, plan, { spend: 300, conversions: 2, cpa: 150, ctr: 20 }),
    [],
  );
  assert.equal(
    recommendOptimizations(campaign, plan, { spend: 600, conversions: 0, cpa: null })[0].action,
    'pause_campaign',
  );
  const winner = recommendOptimizations(campaign, plan, { spend: 3000, conversions: 20, cpa: 150 });
  assert.equal(winner[0].payload.dailyBudget, 575);
  assert.equal(winner[0].requiresApproval, true);
});
test('opportunity scores are reproducible and absent when evidence is incomplete', () => {
  assert.equal(opportunityScore({ demand: 80 }).score, null);
  const components = {
    demand: 80,
    purchasingPower: 80,
    competition: 80,
    advertisingCost: 80,
    profitMargin: 80,
    customerAcquisition: 80,
    fulfillment: 80,
    growth: 80,
    risk: 80,
  };
  assert.equal(opportunityScore(components).score, 80);
});
test('impossible margin plus payment fees yields a blocked plan, never infinite prices', () => {
  const product = structuredClone(productInput);
  product.desiredMargin = 0.8;
  product.costs.paymentPercent = 20;
  const result = calculateEconomics(product);
  assert.equal(result.viable, false);
  assert.equal(result.priceRange.recommended, null);
  assert.equal(result.priceRange.premium, null);
  assert.ok(JSON.stringify(result).includes('null'));
});

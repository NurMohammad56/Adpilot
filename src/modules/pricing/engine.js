import { money } from '../../utils/math.js';

export function calculateEconomics(product, overridePrice, competitorPrices = []) {
  const c = product.costs;
  const expectedReturnCost = money((c.returnRate / (1 - c.returnRate)) * c.returnCost);
  const baseVariableCost = money(
    c.product + c.packaging + c.delivery + c.paymentFixed + c.other + expectedReturnCost,
  );
  const netRatio = 1 - c.paymentPercent / 100;
  const minimumViablePrice = money((baseVariableCost + product.minProfit) / netRatio);
  const assumedAdAllowance = money(Math.max(100, baseVariableCost * 0.3));
  const suggestedPrice =
    netRatio > product.desiredMargin
      ? money(
          Math.max(
            (baseVariableCost + product.minProfit + assumedAdAllowance) / netRatio,
            (baseVariableCost + assumedAdAllowance) / (netRatio - product.desiredMargin),
          ),
        )
      : null;
  const validPrices = competitorPrices
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  const competitivePrice = validPrices.length
    ? validPrices[Math.floor(validPrices.length / 2)]
    : null;
  const price = money(
    overridePrice ?? product.sellingPrice ?? suggestedPrice ?? minimumViablePrice,
  );
  const paymentFee = money(c.paymentFixed + (price * c.paymentPercent) / 100);
  const breakEvenCPA = money(price * netRatio - baseVariableCost);
  const minimumProfit = money(Math.max(product.minProfit, price * product.desiredMargin));
  const targetCPA = money(Math.max(0, breakEvenCPA - minimumProfit));
  const viable =
    suggestedPrice !== null && breakEvenCPA > 0 && targetCPA > 0 && product.inventory > 0;
  const risks = [];
  if (!viable)
    risks.push(
      'The price leaves no sustainable advertising allowance after required profit, or inventory is empty.',
    );
  if (targetCPA > 0 && targetCPA < 100)
    risks.push(
      'The allowable acquisition cost is narrow; confirm real conversion costs before spending.',
    );
  if (competitivePrice && price > competitivePrice * 1.25)
    risks.push(
      'This price is materially above sourced competitor prices; differentiation needs validation.',
    );
  if (suggestedPrice === null)
    risks.push('The desired margin plus payment fees leave no room to cover costs at any price.');
  if (product.sellingPrice && suggestedPrice !== null && product.sellingPrice < suggestedPrice)
    risks.push('The supplied selling price is below the economics-led recommendation.');
  return {
    currency: 'BDT',
    baseVariableCost,
    expectedReturnCost,
    costBreakdown: { product: c.product, packaging: c.packaging, delivery: c.delivery, fixedPayment: c.paymentFixed, operations: c.other, expectedFailureLoss: expectedReturnCost },
    failureScenarios: [Math.max(0, c.returnRate - 0.05), c.returnRate, Math.min(0.8, c.returnRate + 0.1)]
      .filter((rate, index, rates) => rates.indexOf(rate) === index)
      .map(rate => {
        const loss = money(rate / (1 - rate) * c.returnCost);
        const allowableCPA = money(Math.max(0, price * netRatio - (baseVariableCost - expectedReturnCost + loss) - minimumProfit));
        return { failureRate: money(rate), expectedFailureLoss: loss, allowableCPA };
      }),
    paymentFee,
    sellingPrice: price,
    minimumProfit,
    breakEvenCPA,
    targetCPA,
    maximumSustainableAdCost: targetCPA,
    breakEvenROAS: breakEvenCPA > 0 ? money(price / breakEvenCPA) : null,
    targetROAS: targetCPA > 0 ? money(price / targetCPA) : null,
    contributionBeforeAds: breakEvenCPA,
    contributionAtTargetCPA: money(breakEvenCPA - targetCPA),
    priceRange: {
      minimumViable: minimumViablePrice,
      competitive: competitivePrice,
      recommended: suggestedPrice,
      premium: suggestedPrice === null ? null : money(suggestedPrice * 1.15),
      promotional:
        suggestedPrice === null
          ? null
          : money(
              Math.max(minimumViablePrice + assumedAdAllowance / netRatio, suggestedPrice * 0.95),
            ),
    },
    viable,
    risks,
    confidence: competitivePrice ? 'Medium' : 'Low',
    assumptions: [
      'Return cost is expected loss per unsuccessful order, allocated over delivered orders.',
      'Ad allowance is a planning assumption until historical acquisition data exists.',
      'No competitor price is fabricated when sourced prices are unavailable.',
    ],
    formula:
      'Price − product − packaging − delivery − payment fees − operations − expected return/cancellation loss − advertising = contribution',
  };
}

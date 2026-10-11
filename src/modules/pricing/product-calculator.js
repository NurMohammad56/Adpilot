import { money } from '../../utils/math.js';

// Shared by the form and server: no AI, market forecast or currency conversion.
export function autoProductCosts(product) {
  const settings = product.costPlanning;
  if (!settings || settings.mode !== 'automatic') return product;
  const c = product.costs;
  const courierCharge = settings.courierCharge ?? c.delivery;
  const customerCharge = settings.customerDeliveryCharge || 0;
  const delivery = money(
    courierCharge - customerCharge + (customerCharge * c.paymentPercent) / 100,
  );
  const returnCost = money(c.packaging + courierCharge + settings.returnShippingCost);
  const returnRate =
    settings.returnRateSource === 'measured'
      ? c.returnRate
      : product.paymentMethod === 'prepaid'
        ? 0.05
        : 0.1;
  const lossPerDelivered = money((returnRate / (1 - returnRate)) * returnCost);
  const netContribution =
    product.sellingPrice == null
      ? 0
      : money(
          product.sellingPrice * (1 - c.paymentPercent / 100) -
            c.product -
            c.packaging -
            delivery -
            c.paymentFixed -
            c.other -
            lossPerDelivered,
        );
  const minProfit = money(Math.max(0, netContribution) * settings.profitReserveRatio);
  return {
    ...product,
    costs: { ...c, delivery, returnCost, returnRate },
    minProfit,
    desiredMargin: product.sellingPrice ? Math.min(0.8, minProfit / product.sellingPrice) : 0,
  };
}

export function productCostAssumptions(product) {
  if (!product.costPlanning) return [];
  return [
    ...(product.costPlanning.returnRateSource === 'assumed'
      ? [
          'Failed-order rate is an editable planning assumption (COD/mixed 10%, prepaid 5%), not a measured Bangladesh benchmark.',
        ]
      : []),
    ...(product.costPlanning.mode === 'automatic'
      ? [
          'Failed-order loss assumes the product is recovered and reusable: packaging + full outward courier charge + entered return shipping. The customer delivery charge is collected only on successful orders. Damage, refunds and non-recoverable stock require actual costs in manual mode.',
          'The selected share of contribution is reserved as a profit goal; the remainder is an allowable ad cost, not a predicted market CPA.',
        ]
      : []),
  ];
}

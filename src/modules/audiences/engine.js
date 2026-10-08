export function recommendAudience(business, report, overrides = {}) {
  const locations =
    overrides.locations ||
    (business.deliveryRegions.includes('Dhaka') ? ['Dhaka'] : [business.deliveryRegions[0]]);
  return {
    market: 'BD',
    locations,
    ageMin: overrides.ageMin ?? 18,
    ageMax: overrides.ageMax ?? 65,
    genders: [],
    interests: [],
    behaviors: [],
    metaTargeting: {
      geo_locations: { countries: ['BD'] },
      age_min: overrides.ageMin ?? 18,
      age_max: overrides.ageMax ?? 65,
    },
    locationNeedsResolution: !locations.includes('Nationwide'),
    reason:
      'Start in a supported delivery region to limit fulfillment variability. Use broad adults until narrower audience choices have evidence.',
    confidence: report.confidence,
    segments: [
      {
        name: 'Primary Audience',
        type: 'broad',
        active: true,
        profile:
          'Adults within the selected delivery footprint; purchasing power and device behavior unverified.',
      },
      {
        name: 'Secondary Audience',
        type: 'regional-test',
        active: false,
        profile: 'A separate supported-region test after baseline economics are observed.',
      },
      {
        name: 'Experimental Audience',
        type: 'interest-test',
        active: false,
        profile: 'Only use interests resolved through Meta targeting search; no invented IDs.',
      },
      {
        name: 'Retargeting Audience',
        type: 'retargeting',
        active: false,
        profile:
          'Requires consent, a configured pixel, sufficient audience size, and a separately approved plan.',
      },
    ],
    buyerProfile: {
      businessType: 'B2C',
      awareness: 'Unverified',
      painPoints: ['Validate against customer interviews'],
      motivations: ['Demonstrable product value'],
      objections: ['Price, product quality and delivery trust need validation'],
      purchasingPower: 'Insufficient data',
      deviceBehavior: 'Insufficient data',
    },
  };
}

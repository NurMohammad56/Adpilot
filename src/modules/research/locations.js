import { z } from 'zod';
import { assert, now } from '../../utils/core.js';

export const locationSearchSchema = z
  .object({
    query: z.string().trim().min(2).max(100),
    country: z.string().regex(/^[A-Z]{2}$/),
    type: z.enum(['region', 'city']),
  })
  .strict();

// Meta IDs are application-owned facts. The model only receives these saved records.
export async function searchLocations(platform, user, input) {
  const integration = await platform.integration(user.businessId);
  assert(
    platform.config.mode === 'demo' || integration?.verifiedAt,
    409,
    'INTEGRATION_REQUIRED',
    'Connect and verify your Meta account before searching locations',
  );
  const matches = await platform.meta.targetingSearch(
    input.query,
    input.type,
    integration,
    input.country,
  );
  const persist = () =>
    platform.store.transaction(async () => {
      const locations = [];
      for (const match of matches.slice(0, 30)) {
        if (
          match.country_code !== input.country ||
          match.type !== input.type ||
          !match.key ||
          !match.name
        )
          continue;
        const identity = {
          businessId: user.businessId,
          accountId: integration?.adAccountId || 'demo',
          key: String(match.key),
          country: input.country,
          type: input.type,
        };
        const existing = await platform.store.find('targeting_locations', identity);
        locations.push(
          existing ||
            (await platform.store.insert('targeting_locations', {
              ...identity,
              name: String(match.name).slice(0, 200),
              regionName: String(match.region || '').slice(0, 200),
              verifiedAt: now(),
              demo: platform.config.mode === 'demo',
            })),
        );
      }
      return locations;
    });
  try {
    return await persist();
  } catch (error) {
    if (error.code === 11000) return persist();
    throw error;
  }
}

export async function resolveLocations(platform, user, ids = [], countries = []) {
  assert(
    new Set(ids).size === ids.length && ids.length <= 8,
    422,
    'LOCATION_INVALID',
    'Choose up to eight distinct regions or cities for a focused comparison',
  );
  const integration = await platform.integration(user.businessId);
  return Promise.all(
    ids.map(async (id) => {
      const location = await platform.owned('targeting_locations', id, user);
      assert(
        countries.includes(location.country) &&
          location.accountId === (integration?.adAccountId || 'demo') &&
          (platform.config.mode === 'demo' || (!location.demo && integration?.verifiedAt)),
        422,
        'LOCATION_INVALID',
        'Location must belong to a candidate country and your connected account',
      );
      return location;
    }),
  );
}

export function regionalCoverage(output, ids) {
  const actual = (output.regions || []).map((region) => region.locationId);
  return (
    actual.length === ids.length &&
    new Set(actual).size === actual.length &&
    actual.every((id) => ids.includes(id))
  );
}

export function regionalGeo(targets, country) {
  assert(
    targets.length > 0 &&
      targets.length <= 8 &&
      targets.every(
        (target) =>
          target.country === country &&
          ['region', 'city'].includes(target.type) &&
          target.key &&
          target.verifiedAt,
      ),
    422,
    'LOCATION_INVALID',
    'Regional targeting requires verified locations in the approved country',
  );
  const geo = {};
  for (const target of targets) {
    const field = target.type === 'region' ? 'regions' : 'cities';
    (geo[field] ||= []).push({ key: target.key });
  }
  // Adding countries alongside cities/regions would widen the audience to the whole country.
  return geo;
}

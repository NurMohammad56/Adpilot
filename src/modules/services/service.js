import { z } from 'zod';
import { assert, hash, now } from '../../utils/core.js';
import { countryNames } from '../research/countries.js';
import { evidenceSchema } from '../schemas.js';
import { resolveLocations } from '../research/locations.js';
import { validateAdLibrarySelection } from '../research/ad-library.js';

const optionalAmount = z.number().min(0).max(1e8).nullable().default(null);
export const serviceProfileSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    kind: z.enum(['service', 'software']),
    category: z.string().trim().max(150).default(''),
    description: z.string().trim().min(10).max(4000),
    buyerProfile: z.string().trim().min(10).max(4000),
    deliverables: z.string().trim().max(4000).default(''),
    differentiation: z.string().trim().max(3000).default(''),
    proof: z.string().trim().max(4000).default(''),
    country: z.enum(Object.keys(countryNames)),
    candidateLocationIds: z.array(z.string().uuid()).max(8).default([]),
    goal: z.enum(['leads', 'purchases']).default('leads'),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .default('BDT'),
    landingUrl: z
      .string()
      .url()
      .max(1000)
      .refine((url) => url.startsWith('https://'), 'HTTPS required')
      .or(z.literal(''))
      .default(''),
    price: optionalAmount.refine((value) => value === null || value > 0),
    deliveryCost: optionalAmount,
    requiredProfit: optionalAmount,
    leadCloseRate: z.number().positive().max(1).nullable().default(null),
    mediaAssetId: z.string().uuid().nullable().default(null),
    thumbnailAssetId: z.string().uuid().nullable().default(null),
    evidence: z.array(evidenceSchema).max(30).default([]),
    adLibraryIds: z
      .array(z.string().uuid())
      .max(12)
      .refine((ids) => new Set(ids).size === ids.length)
      .default([]),
  })
  .strict();

export const serviceFacts = (row) =>
  serviceProfileSchema.parse(
    Object.fromEntries(Object.keys(serviceProfileSchema.shape).map((key) => [key, row[key]])),
  );
export const serviceHash = (row) => hash({ ...serviceFacts(row), revision: row.revision });

export const serviceAssessmentSchema = z
  .object({
    decision: z.enum(['test', 'revise', 'hold']),
    rationale: z.string().min(1).max(3000),
    offerPositioning: z.string().min(1).max(3000),
    idealBuyer: z.string().min(1).max(2500),
    buyingProcess: z.string().min(1).max(2500),
    acquisitionApproach: z.string().min(1).max(3000),
    offerTests: z.array(z.string().max(1000)).min(1).max(8),
    validationSteps: z.array(z.string().max(1000)).min(1).max(10),
    stopCriteria: z.array(z.string().max(1000)).min(1).max(8),
    evidenceGaps: z.array(z.string().max(1000)).max(12),
  })
  .strict();

export async function assertServiceLink(platform, user, project, report = null) {
  if (project.researchMode === 'single-country-service')
    assert(
      project.serviceProfileId,
      422,
      'SERVICE_PROFILE_REQUIRED',
      'Select a saved service for this country workspace.',
    );
  if (!project.serviceProfileId) return null;
  const profile = await platform.owned('service_profiles', project.serviceProfileId, user);
  assert(
    project.kind === profile.kind && project.kind !== 'physical-product',
    422,
    'SERVICE_PROFILE_KIND',
    'Use the matching digital service or software profile.',
  );
  if (project.researchMode === 'single-country-service')
    assert(
      project.candidateCountries.length === 1 && project.candidateCountries[0] === profile.country,
      409,
      'SERVICE_COUNTRY',
      'This service workspace uses its saved target country. Update the service profile first.',
    );
  if (report?.linkedServiceHash)
    assert(
      report.linkedServiceHash === serviceHash(profile),
      409,
      'STALE_SERVICE_RESEARCH',
      'Service facts changed. Research the updated service and request a fresh review.',
    );
  return profile;
}

async function validateProfile(platform, user, input) {
  await validateAdLibrarySelection(platform, user, input.adLibraryIds);
  await resolveLocations(platform, user, input.candidateLocationIds, [input.country]);
  if (input.mediaAssetId)
    await platform.media.bind(user, {
      mediaAssetId: input.mediaAssetId,
      thumbnailAssetId: input.thumbnailAssetId,
    });
  assert(
    input.thumbnailAssetId === null || input.mediaAssetId,
    422,
    'SERVICE_MEDIA',
    'Choose the main creative before its video cover.',
  );
}

export async function saveService(platform, user, raw, id = null) {
  const input = serviceProfileSchema.parse(raw);
  await validateProfile(platform, user, input);
  return platform.store.transaction(async () => {
    const previous = id ? await platform.owned('service_profiles', id, user) : null;
    if (previous && hash(serviceFacts(previous)) === hash(input)) return previous;
    const saved = previous
      ? await platform.store.update('service_profiles', id, {
          ...input,
          revision: previous.revision + 1,
        })
      : await platform.store.insert('service_profiles', {
          ...input,
          businessId: user.businessId,
          createdBy: user.id,
          revision: 1,
        });
    if (previous) {
      for (const project of await platform.store.list('research_projects', {
        businessId: user.businessId,
        serviceProfileId: id,
      })) {
        if (project.currentVersionId)
          await platform.store.update('research_versions', project.currentVersionId, {
            serviceProfileInvalidatedAt: now(),
            staleReason: 'Service profile changed. Research its current facts before review.',
          });
        await platform.store.update('research_projects', project.id, {
          status: 'needs_research',
          approvedVersionId: null,
          serviceProfileInvalidatedAt: now(),
        });
        for (const plan of await platform.store.list('campaign_plans', {
          businessId: user.businessId,
          researchProjectId: project.id,
        })) {
          if (
            ['executed', 'executing', 'superseded'].includes(plan.status) ||
            (await platform.store.find('campaigns', {
              businessId: user.businessId,
              planId: plan.id,
            })) ||
            (await platform.store.find('manual_campaigns', {
              businessId: user.businessId,
              planId: plan.id,
            }))
          )
            continue;
          await platform.store.update('campaign_plans', plan.id, {
            status: 'needs_research',
            serviceProfileInvalidatedAt: now(),
            staleReason: 'Service profile changed. Prepare a fresh reviewed plan.',
          });
          for (const approval of await platform.store.list('approval_requests', {
            businessId: user.businessId,
            planId: plan.id,
          }))
            if (['pending', 'approved'].includes(approval.status))
              await platform.store.update('approval_requests', approval.id, {
                status: 'superseded',
                staleReason: 'Service profile changed.',
                supersededAt: now(),
              });
        }
      }
    }
    await platform.audit(user, previous ? 'service.updated' : 'service.created', saved.id, {
      revision: saved.revision,
    });
    return saved;
  });
}

export async function serviceResearchBrief(platform, user, id) {
  return platform.store.transaction(async () => {
    const profile = await platform.owned('service_profiles', id, user);
    const input = {
      name: profile.name,
      kind: profile.kind,
      serviceProfileId: profile.id,
      researchMode: 'single-country-service',
      productId: null,
      description: profile.description,
      buyerProfile: profile.buyerProfile,
      candidateCountries: [profile.country],
      candidateLocationIds: profile.candidateLocationIds,
      questions:
        'Assess this exact service in the selected country. Produce an actionable offer, buyer, competition, acquisition and small-budget validation decision. Explain counter-evidence and what to validate before spending.',
      evidence: profile.evidence,
      adLibraryIds: profile.adLibraryIds,
    };
    let project = (
      await platform.store.list('research_projects', {
        businessId: user.businessId,
        serviceProfileId: id,
      })
    ).find(
      (row) =>
        row.researchMode === 'single-country-service' &&
        row.candidateCountries.length === 1 &&
        row.candidateCountries[0] === profile.country,
    );
    const reused = Boolean(project && project.serviceProfileSnapshotHash === serviceHash(profile));
    if (project && !reused) {
      const baseAds = new Set(project.serviceBaseAdLibraryIds || []);
      input.adLibraryIds = [
        ...new Set([
          ...profile.adLibraryIds,
          ...(project.adLibraryIds || []).filter((id) => !baseAds.has(id)),
        ]),
      ].slice(0, 12);
      const baseEvidence = new Set((project.serviceBaseEvidence || []).map((row) => hash(row)));
      input.evidence = [
        ...new Map(
          [
            ...profile.evidence,
            ...(project.evidence || []).filter((row) => !baseEvidence.has(hash(row))),
          ].map((row) => [hash(row), row]),
        ).values(),
      ].slice(0, 30);
    }
    if (!reused) {
      const business = await platform.store.get('businesses', user.businessId);
      await platform.store.update('businesses', business.id, {
        serviceMutationVersion: (business.serviceMutationVersion || 0) + 1,
      });
    }
    if (!project) project = await platform.research.create(user, input);
    else if (!reused) project = await platform.research.update(user, project.id, input);
    if (!reused)
      project = await platform.store.update('research_projects', project.id, {
        serviceProfileSnapshotHash: serviceHash(profile),
        serviceCountry: profile.country,
        serviceBaseAdLibraryIds: profile.adLibraryIds,
        serviceBaseEvidence: profile.evidence,
      });
    return { profile, project, reused };
  });
}

export async function listServices(platform, user) {
  const [profiles, projects] = await Promise.all(
    ['service_profiles', 'research_projects'].map((collection) =>
      platform.store.list(collection, { businessId: user.businessId }),
    ),
  );
  return profiles
    .filter((row) => !row.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((profile) => ({
      ...profile,
      research:
        projects.find(
          (project) =>
            project.serviceProfileId === profile.id &&
            project.researchMode === 'single-country-service' &&
            project.candidateCountries[0] === profile.country,
        ) || null,
    }));
}

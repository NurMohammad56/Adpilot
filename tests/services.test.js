import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fixture } from './helpers.js';
import {
  saveService,
  listServices,
  serviceResearchBrief,
  serviceFacts,
} from '../src/modules/services/service.js';
import { createServicePlan } from '../src/modules/campaigns/service-plan.js';
import { projectSchema } from '../src/modules/research/workbench.js';
import { reportProse } from '../src/modules/research/report-translation.js';
import { createStorage } from '../src/storage/index.js';
import { deletionPreview, deleteManagedRecord } from '../src/modules/records.js';

const input = {
  name: 'Custom retail ecommerce',
  kind: 'service',
  description: 'Custom ecommerce development for retailers with integration requirements.',
  buyerProfile: 'Retail owners with an existing business and verified integration problems.',
  country: 'US',
  currency: 'USD',
  deliverables: 'Discovery, integration scope and delivery plan.',
  proof: 'Owner-supplied portfolio, not proof of demand.',
};
const assessment = {
  decision: 'hold',
  rationale: 'Buyer evidence is still insufficient.',
  offerPositioning: 'Validate custom integration needs.',
  idealBuyer: 'Existing retailers with a concrete integration problem.',
  buyingProcess: 'Confirm the budget owner and decision process.',
  acquisitionApproach: 'Validate qualified enquiries before paying for ads.',
  offerTests: ['Test an actual integration pain point.'],
  validationSteps: ['Record qualified buyer interviews.'],
  stopCriteria: ['Stop when the offered scope cannot solve the buyer problem.'],
  evidenceGaps: ['No measured acquisition economics.'],
};
function modelReport(context) {
  return {
    summary: 'Investigate this exact service and country using supplied facts.',
    countries: context.project.candidateCountries.map((country) => ({
      country,
      opportunity: 'Investigate actual buyer needs.',
      buyerSegments: ['Retail operators'],
      competition: 'Comparable competitor sources need verification.',
      languages: ['English'],
      advantages: [],
      risks: ['Unverified buyer intent'],
      testApproach: 'Use a bounded validation test.',
      confidence: 'Low',
    })),
    findings: [],
    recommendation: {
      country: context.project.candidateCountries[0],
      reason: 'The country is a hypothesis, not verified demand.',
      nextSteps: ['Verify qualified buyer need.'],
    },
    openQuestions: ['Which buyers have this problem?'],
    serviceAssessment: structuredClone(assessment),
  };
}
async function approved(f, projectId) {
  const initial = await f.research.research(f.user, projectId);
  const edited = await f.research.edit(f.user, initial.id, {
    summary: initial.report.summary,
    recommendation: {
      ...initial.report.recommendation,
      country: 'US',
      reason: 'Owner chooses a capped test and accepts the documented evidence gaps.',
    },
    serviceDecision: 'test',
    note: 'Explicit owner decision for a bounded validation test.',
  });
  await f.research.submit(f.user, edited.id);
  await f.research.decide(
    f.user,
    edited.id,
    'approve',
    'Reviewed the evidence limits and selected the bounded test.',
  );
  return edited;
}

test('service profiles reuse a single-country workspace and cached analysis without repeated entry', async () => {
  const f = await fixture();
  try {
    const profile = await saveService(f.platform, f.user, input);
    const first = await serviceResearchBrief(f.platform, f.user, profile.id),
      second = await serviceResearchBrief(f.platform, f.user, profile.id);
    assert.equal(first.project.id, second.project.id);
    assert.equal(second.reused, true);
    assert.deepEqual(first.project.candidateCountries, ['US']);
    let calls = 0;
    f.platform.llm.generate = async (task, context) => {
      calls++;
      assert.equal(task, 'market-comparison');
      assert.equal(context.serviceProfile.deliverables, input.deliverables);
      assert.match(context.singleCountryRules, /single-country/);
      return modelReport(context);
    };
    const one = await f.research.research(f.user, first.project.id),
      two = await f.research.research(f.user, first.project.id);
    assert.equal(calls, 1);
    assert.equal(one.report.recommendation.country, null);
    assert.equal(two.report.serviceAssessment.decision, 'hold');
    assert(two.report.researchReuse.cached);
    await assert.rejects(f.research.submit(f.user, two.id), { code: 'DECISION_REQUIRED' });
    assert.equal((await listServices(f.platform, f.user)).length, 1);
    const unchanged = await saveService(f.platform, f.user, serviceFacts(profile), profile.id);
    assert.equal(unchanged.revision, profile.revision);
    const entries = reportProse(one.report);
    assert(entries.some((entry) => entry.path.join('.') === 'serviceAssessment.rationale'));
    assert(!entries.some((entry) => entry.path.at(-1) === 'decision'));
    assert.equal(f.meta.calls.length, 0);
  } finally {
    await f.close();
  }
});

test('service profile changes invalidate approved research and unlaunched campaigns while retaining history', async () => {
  const f = await fixture();
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'adpilot-service-test-'));
  try {
    const bytes = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY4sAAAAASUVORK5CYII=',
      'base64',
    );
    f.media.storage = createStorage({
      storageDriver: 'local',
      storagePath: path.join(root, 'files'),
    });
    const filename = path.join(root, 'image.png');
    await fs.writeFile(filename, bytes);
    const asset = await f.media.upload(f.user, {
      path: filename,
      originalname: 'service.png',
      size: bytes.length,
    });
    const profile = await saveService(f.platform, f.user, { ...input, mediaAssetId: asset.id });
    const { project } = await serviceResearchBrief(f.platform, f.user, profile.id);
    const version = await approved(f, project.id);
    const plan = await createServicePlan(f.platform, f.user, version.id, {
      goal: 'leads',
      landingUrl: 'https://service.example/contact',
      price: null,
      deliveryCost: null,
      requiredProfit: null,
      leadCloseRate: null,
      dailyBudget: 200,
      durationDays: 5,
      testBudgetCeiling: 1000,
      acknowledgeUnknownCPA: true,
      mediaAssetId: asset.id,
    });
    assert.equal(plan.serviceProfileId, profile.id);
    const approval = await f.platform.submitPlan(f.user, plan.id, 'manual');
    await f.platform.decide(
      f.user,
      approval.id,
      'approve',
      'Approved a guide without starting paid ads.',
    );
    const history = structuredClone((await f.store.get('approval_requests', approval.id)).snapshot);
    await saveService(
      f.platform,
      f.user,
      {
        ...serviceFacts(profile),
        description: input.description + ' New delivery scope needs validation.',
      },
      profile.id,
    );
    assert.equal((await f.store.get('research_projects', project.id)).status, 'needs_research');
    assert.equal((await f.store.get('campaign_plans', plan.id)).status, 'needs_research');
    const stale = await f.store.get('approval_requests', approval.id);
    assert.equal(stale.status, 'superseded');
    assert.deepEqual(stale.snapshot, history);
    await assert.rejects(f.research.approved(f.user, version.id), {
      code: 'STALE_SERVICE_RESEARCH',
    });
    const renewed = await serviceResearchBrief(f.platform, f.user, profile.id);
    assert.equal(renewed.project.id, project.id);
    assert.equal(renewed.reused, false);
    assert.equal(
      (await f.store.get('research_versions', version.id)).reportHash,
      version.reportHash,
    );
    assert.equal(f.meta.calls.length, 0);
  } finally {
    await f.close();
    assert(root.startsWith(path.join(os.tmpdir(), 'adpilot-service-test-')));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('profile and research link validation enforces tenant, type, country and concurrent source freshness', async () => {
  const f = await fixture();
  try {
    const profile = await saveService(f.platform, f.user, input);
    await assert.rejects(
      serviceResearchBrief(f.platform, { ...f.user, businessId: randomUUID() }, profile.id),
      { code: 'NOT_FOUND' },
    );
    await assert.rejects(
      f.research.create(
        f.user,
        projectSchema.parse({
          name: 'Wrong country',
          kind: 'service',
          description: input.description,
          buyerProfile: input.buyerProfile,
          candidateCountries: ['GB'],
          serviceProfileId: profile.id,
          researchMode: 'single-country-service',
        }),
      ),
      { code: 'SERVICE_COUNTRY' },
    );
    await assert.rejects(
      f.research.create(
        f.user,
        projectSchema.parse({
          name: 'No profile',
          kind: 'service',
          description: input.description,
          buyerProfile: input.buyerProfile,
          candidateCountries: ['US'],
          researchMode: 'single-country-service',
        }),
      ),
      { code: 'SERVICE_PROFILE_REQUIRED' },
    );
    const { project } = await serviceResearchBrief(f.platform, f.user, profile.id);
    f.platform.llm.generate = async (task, context) => {
      await saveService(
        f.platform,
        f.user,
        { ...serviceFacts(profile), proof: 'New facts while the provider runs.' },
        profile.id,
      );
      return modelReport(context);
    };
    await assert.rejects(f.research.research(f.user, project.id), {
      code: 'STALE_SERVICE_RESEARCH',
    });
    assert.equal((await f.store.list('research_versions', { projectId: project.id })).length, 0);
  } finally {
    await f.close();
  }
});

test('country changes keep earlier work, comparison remains separate, and deleting a profile cascades its drafts', async () => {
  const f = await fixture();
  try {
    const profile = await saveService(f.platform, f.user, input);
    const first = await serviceResearchBrief(f.platform, f.user, profile.id);
    await saveService(f.platform, f.user, { ...serviceFacts(profile), country: 'GB' }, profile.id);
    const second = await serviceResearchBrief(f.platform, f.user, profile.id);
    assert.notEqual(first.project.id, second.project.id);
    assert(await f.store.get('research_projects', first.project.id));
    const comparison = await f.research.create(
      f.user,
      projectSchema.parse({
        name: profile.name,
        kind: profile.kind,
        description: profile.description,
        buyerProfile: profile.buyerProfile,
        candidateCountries: ['US', 'GB'],
        serviceProfileId: profile.id,
        researchMode: 'market-comparison',
      }),
    );
    assert.deepEqual(comparison.candidateCountries, ['US', 'GB']);
    const preview = await deletionPreview(f.platform, f.user, 'services', profile.id);
    await deleteManagedRecord(f.platform, f.user, 'services', profile.id, preview.token);
    await assert.rejects(f.platform.owned('service_profiles', profile.id, f.user), {
      code: 'NOT_FOUND',
    });
    assert.equal(
      (await f.store.list('research_projects', { serviceProfileId: profile.id })).filter(
        (row) => !row.deletedAt,
      ).length,
      0,
    );
  } finally {
    await f.close();
  }
});

import { z } from 'zod';
import { assert, hash, now } from '../../utils/core.js';
import { workspaceLLM } from '../../integrations/credentials.js';
import { evidenceSchema, retrievalSchema } from '../schemas.js';
import { resolveLocations, regionalCoverage } from './locations.js';
import { actualResults } from '../analytics/outcomes.js';
import { countryNames } from './countries.js';
export { countryNames } from './countries.js';
export const countryCode = z.enum(Object.keys(countryNames));
const words = z.string().trim().min(1).max(4000);
export const projectSchema = z
  .object({
    name: z.string().trim().min(2).max(200),
    kind: z.enum(['physical-product', 'service', 'software']),
    productId: z.string().uuid().nullable().optional(),
    description: words,
    buyerProfile: words,
    candidateCountries: z
      .array(countryCode)
      .min(1)
      .max(10)
      .refine((values) => new Set(values).size === values.length),
    questions: z.string().max(5000).default(''),
    candidateLocationIds: z.array(z.string().uuid()).max(8).optional(),
    evidence: z.array(evidenceSchema).max(30).default([]),
  })
  .strict();
export const briefOf = (project) =>
  projectSchema.parse(
    Object.fromEntries(Object.keys(projectSchema.shape).map((key) => [key, project[key]])),
  );
const marketSchema = z
  .object({
    country: countryCode,
    opportunity: words,
    buyerSegments: z.array(z.string().min(1).max(500)).max(10),
    competition: words,
    languages: z.array(z.string().max(100)).max(5),
    advantages: z.array(z.string().max(1000)).max(10),
    risks: z.array(z.string().max(1000)).max(10),
    testApproach: words,
    confidence: z.enum(['Low', 'Medium', 'High']),
  })
  .strict();
export const comparisonSchema = z
  .object({
    summary: words,
    countries: z.array(marketSchema).min(1).max(10),
    regions: z
      .array(
        z
          .object({
            locationId: z.string().uuid(),
            opportunity: words,
            buyerSegments: z.array(z.string().min(1).max(500)).max(10),
            competition: words,
            barriers: z.array(z.string().max(1000)).max(10),
            testApproach: words,
            evidenceGaps: z.array(z.string().max(1000)).max(10),
          })
          .strict(),
      )
      .max(8)
      .optional(),
    findings: z.array(evidenceSchema).max(40),
    recommendation: z
      .object({
        country: countryCode.nullable(),
        locationIds: z.array(z.string().uuid()).max(8).optional(),
        reason: words,
        nextSteps: z.array(z.string().max(1000)).max(12),
      })
      .strict(),
    openQuestions: z.array(z.string().max(1000)).max(15),
    retrieval: retrievalSchema.optional(),
  })
  .strict();
export const reportEditSchema = z
  .object({
    summary: words,
    recommendation: comparisonSchema.shape.recommendation,
    note: z.string().min(5).max(3000),
    countries: z.array(marketSchema).min(1).max(10).optional(),
  })
  .strict();
export class ResearchWorkbench {
  constructor(platform) {
    this.platform = platform;
    this.store = platform.store;
  }
  async create(user, input) {
    await resolveLocations(
      this.platform,
      user,
      input.candidateLocationIds,
      input.candidateCountries,
    );
    if (input.productId) await this.platform.owned('products', input.productId, user);
    return this.store.transaction(async () => {
      const project = await this.store.insert('research_projects', {
        ...input,
        businessId: user.businessId,
        revision: 1,
        status: 'draft',
        currentVersionId: null,
        approvedVersionId: null,
        createdBy: user.id,
      });
      await this.platform.audit(user, 'research.project_created', project.id);
      return project;
    });
  }
  async update(user, projectId, input) {
    await resolveLocations(
      this.platform,
      user,
      input.candidateLocationIds,
      input.candidateCountries,
    );
    if (input.productId) await this.platform.owned('products', input.productId, user);
    return this.store.transaction(async () => {
      const project = await this.platform.owned('research_projects', projectId, user);
      if (project.currentVersionId) {
        const version = await this.store.get('research_versions', project.currentVersionId);
        if (version?.status === 'pending')
          await this.store.update('research_versions', version.id, { status: 'superseded' });
      }
      const updated = await this.store.update('research_projects', projectId, {
        ...input,
        revision: project.revision + 1,
        status: 'draft',
        approvedVersionId: null,
      });
      await this.platform.audit(user, 'research.brief_updated', projectId, {
        revision: updated.revision,
      });
      return updated;
    });
  }
  validateReport(project, output) {
    assert(
      regionalCoverage(output, project.candidateLocationIds || []),
      422,
      'RESEARCH_REGIONS',
      'Research must compare each selected state, region or city exactly once',
    );
    const ids = output.recommendation.locationIds || [];
    assert(
      new Set(ids).size === ids.length &&
        ids.every((id) => (project.candidateLocationIds || []).includes(id)),
      422,
      'RESEARCH_REGIONS',
      'The regional decision must use locations from the research brief',
    );
    const selected = output.countries.map((country) => country.country);
    assert(
      selected.length === project.candidateCountries.length &&
        new Set(selected).size === selected.length &&
        selected.every((code) => project.candidateCountries.includes(code)),
      422,
      'RESEARCH_COUNTRIES',
      'Research must compare each candidate country exactly once',
    );
    assert(
      output.recommendation.country === null ||
        project.candidateCountries.includes(output.recommendation.country),
      422,
      'RESEARCH_COUNTRIES',
      'The recommended country must be in the brief',
    );
  }
  async saveVersion(user, project, report, instruction, parent = null) {
    this.validateReport(project, report);
    const locations = await resolveLocations(
      this.platform,
      user,
      project.candidateLocationIds,
      project.candidateCountries,
    );
    assert(
      (report.recommendation.locationIds || []).every(
        (id) =>
          locations.find((location) => location.id === id)?.country ===
          report.recommendation.country,
      ),
      422,
      'RESEARCH_REGIONS',
      'Choose regions within the selected test country',
    );
    return this.store.transaction(async () => {
      const latest = await this.platform.owned('research_projects', project.id, user);
      assert(
        latest.revision === project.revision &&
          latest.currentVersionId === project.currentVersionId,
        409,
        'RESEARCH_CHANGED',
        'Research changed while processing; review the latest version',
      );
      if (latest.currentVersionId) {
        const previous = await this.store.get('research_versions', latest.currentVersionId);
        if (previous.status === 'pending')
          await this.store.update('research_versions', previous.id, { status: 'superseded' });
      }
      const version = await this.store.insert('research_versions', {
        businessId: user.businessId,
        projectId: project.id,
        number: (latest.versionNumber || 0) + 1,
        projectRevision: project.revision,
        parentId: parent?.id || latest.currentVersionId,
        briefHash: hash(briefOf(project)),
        report,
        reportHash: hash(report),
        instruction,
        status: 'draft',
        createdBy: user.id,
      });
      await this.store.update('research_projects', project.id, {
        currentVersionId: version.id,
        versionNumber: version.number,
        status: 'draft',
        approvedVersionId: null,
      });
      await this.platform.audit(user, 'research.version_created', version.id, {
        version: version.number,
      });
      return version;
    });
  }
  async research(user, projectId, instruction = '', language = 'en') {
    const project = await this.platform.owned('research_projects', projectId, user);
    const previous = project.currentVersionId
      ? await this.store.get('research_versions', project.currentVersionId)
      : null;
    const llm = await workspaceLLM(this.platform, user.businessId);
    const locations = await resolveLocations(
      this.platform,
      user,
      project.candidateLocationIds,
      project.candidateCountries,
    );
    const plans = await this.store.list('campaign_plans', {
      businessId: user.businessId,
      researchProjectId: project.id,
    });
    const campaigns = (await this.store.list('campaigns', { businessId: user.businessId })).filter(
      (campaign) => plans.some((plan) => plan.id === campaign.planId),
    );
    const measured = campaigns.length
      ? await actualResults(this.platform, user, {
          from: '2000-01-01',
          to: new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10),
        })
      : null;
    const generated = await llm.generate(
      'market-comparison',
      {
        project: { ...briefOf(project), candidateLocations: locations },
        previousReport: previous?.report,
        instruction,
        responseLanguage: language === 'bn' ? 'Bangla' : 'English',
        regionalRules:
          'Compare every candidateLocationId exactly once using the saved candidateLocations. Investigate buyer clusters, language, local alternatives, delivery/service coverage and evidence gaps at state/region/city level. Whole-country statistics do not prove regional demand. Never invent Meta location keys, local CPC, conversion estimates or population. Keep locationIds empty when evidence cannot justify narrowing. For small budgets recommend one offer and one ad set; avoid fragmenting spend across regions.',
        evidence: project.evidence,
        actualBusinessResults: {
          classification:
            'User-recorded business outcomes and Meta campaign-level spend; completeness is not independently verified.',
          campaigns: (measured?.results || []).filter((result) =>
            campaigns.some((campaign) => campaign.id === result.campaignId),
          ),
          rules:
            "Use only this project's observed outcomes as retrospective context. Do not infer regional conversion rates from country-wide results or treat platform attribution as confirmed sales. Missing values remain unknown.",
        },
        rules:
          'Write human-readable analysis in responseLanguage while preserving country codes and structured field names. Compare only the supplied countries. Investigate actual buyer segments and problem urgency, alternatives and competition, buying readiness, language, payment and sales barriers, delivery capacity and local requirements. Explicitly examine counter-evidence and why this offer could fail in each market. Identify evidence gaps and what would change the recommendation. For B2B services include decision makers, buying cycle, trust signals and a measurable interview/qualified-lead validation plan. For physical products include COD, failed deliveries and fulfillment. Use previousReport and instruction to build on prior analysis. Do not invent demand, CPC, budgets, conversion rates, rankings, verified sources or guaranteed outcomes. A country recommendation is a hypothesis, not approval to publish.',
      },
      comparisonSchema,
    );
    const report = generated || {
      summary: `${project.name}: compare candidate markets using the supplied business facts. Demo hypotheses need current evidence.`,
      countries: project.candidateCountries.map((country) => ({
        country,
        opportunity: `Investigate whether the stated offer solves a problem for buyers in ${countryNames[country]}.`,
        buyerSegments: [project.buyerProfile],
        competition: 'Competitor demand, offers and prices have not been independently checked.',
        languages: [country === 'BD' ? 'Bangla' : 'English'],
        advantages: ['Test the stated benefits with a small, reviewed campaign'],
        risks: [
          'Demand and customer acquisition cost are unknown',
          'Verify language, sales process and local requirements',
        ],
        testApproach:
          'Interview prospective buyers, inspect dated competitor sources, then test one offer and measure qualified conversions.',
        confidence: 'Low',
      })),
      findings: project.evidence,
      ...(locations.length
        ? {
            regions: locations.map((location) => ({
              locationId: location.id,
              opportunity: `Investigate the actual buyers for ${project.name} in ${location.name}, ${countryNames[location.country]}.`,
              buyerSegments: [project.buyerProfile],
              competition: 'Regional competitors have not been independently verified.',
              barriers: ['Regional demand and acquisition cost are unknown.'],
              testApproach:
                'Validate buyer need and delivery coverage, then use one capped ad set with measured outcomes.',
              evidenceGaps: [
                'Dated regional sources and actual qualified customer outcomes are needed.',
              ],
            })),
          }
        : {}),
      recommendation: {
        country: null,
        reason:
          'Evidence is insufficient to rank countries. Review the comparison and choose a test country explicitly.',
        nextSteps: [
          'Add dated sources',
          'Ask a focused follow-up question',
          'Edit the conclusion before requesting review',
        ],
      },
      openQuestions: [
        project.questions || 'Which buyer problem, offer price and sales channel can you support?',
      ],
    };
    const allowed = new Set(project.evidence.map((item) => item.source));
    report.findings = report.findings.map((item) => ({
      ...item,
      source:
        allowed.has(item.source) || ['gemini', 'openai'].includes(llm.config?.llmProvider)
          ? item.source
          : 'ai-provider',
      confidence: 'Low',
      quality: 'AI-generated assumptions',
      classification: 'ai-generated',
    }));
    report.countries = report.countries.map((country) => ({ ...country, confidence: 'Low' }));
    return this.saveVersion(user, project, report, instruction || 'Initial comparison', previous);
  }
  async edit(user, versionId, input) {
    const version = await this.platform.owned('research_versions', versionId, user);
    const project = await this.platform.owned('research_projects', version.projectId, user);
    assert(
      project.currentVersionId === version.id,
      409,
      'STALE_RESEARCH',
      'Edit the latest version',
    );
    const report = { ...version.report, ...input };
    delete report.note;
    report.countries = report.countries.map((item) => ({ ...item, confidence: 'Low' }));
    return this.saveVersion(user, project, report, `Human edit: ${input.note}`, version);
  }
  async submit(user, versionId) {
    return this.store.transaction(async () => {
      const version = await this.platform.owned('research_versions', versionId, user);
      const project = await this.platform.owned('research_projects', version.projectId, user);
      assert(
        project.currentVersionId === version.id &&
          version.projectRevision === project.revision &&
          version.status === 'draft',
        409,
        'STALE_RESEARCH',
        'Submit the latest unsubmitted research version',
      );
      assert(
        hash(version.report) === version.reportHash,
        409,
        'RESEARCH_TAMPERED',
        'Research integrity check failed',
      );
      assert(
        version.report.recommendation.country,
        422,
        'DECISION_REQUIRED',
        'Select a test country and explain the decision before review',
      );
      const saved = await this.store.update('research_versions', version.id, {
        status: 'pending',
        submittedBy: user.id,
      });
      await this.platform.audit(user, 'research.review_requested', version.id);
      return saved;
    });
  }
  async decide(user, versionId, decision, comment) {
    this.platform.requireApprover(user);
    return this.store.transaction(async () => {
      const version = await this.platform.owned('research_versions', versionId, user);
      const project = await this.platform.owned('research_projects', version.projectId, user);
      assert(
        version.status === 'pending' &&
          project.currentVersionId === version.id &&
          project.revision === version.projectRevision,
        409,
        'STALE_RESEARCH',
        'Only the current pending version can be reviewed',
      );
      assert(
        hash(version.report) === version.reportHash && hash(briefOf(project)) === version.briefHash,
        409,
        'RESEARCH_TAMPERED',
        'Research or brief changed',
      );
      const saved = await this.store.update('research_versions', versionId, {
        status: decision === 'approve' ? 'approved' : 'rejected',
        reviewedBy: user.id,
        reviewedAt: now(),
        reviewComment: comment,
      });
      await this.store.update('research_projects', project.id, {
        status: saved.status,
        approvedVersionId: decision === 'approve' ? version.id : null,
      });
      await this.platform.audit(user, `research.${saved.status}`, versionId, { comment });
      return saved;
    });
  }
  async approved(user, versionId) {
    const version = await this.platform.owned('research_versions', versionId, user);
    const project = await this.platform.owned('research_projects', version.projectId, user);
    assert(
      version.status === 'approved' &&
        project.approvedVersionId === version.id &&
        project.currentVersionId === version.id &&
        project.revision === version.projectRevision &&
        hash(briefOf(project)) === version.briefHash &&
        hash(version.report) === version.reportHash,
      409,
      'RESEARCH_APPROVAL_REQUIRED',
      'The latest research decision must be approved before a campaign draft can use it',
    );
    return { version, project };
  }
}

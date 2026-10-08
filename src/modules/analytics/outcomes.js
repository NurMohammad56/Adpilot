import { z } from 'zod';
import { assert, money, now } from '../../utils/core.js';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  );
export const outcomeSchema = z
  .object({
    campaignId: z.string().uuid(),
    reference: z.string().trim().min(2).max(120),
    kind: z.enum(['lead', 'order']),
    status: z.enum(['new', 'qualified', 'won', 'delivered', 'returned', 'failed', 'lost']),
    observedOn: date,
    receivedRevenue: z.number().finite().min(0).max(1e8),
    refunds: z.number().finite().min(0).max(1e8),
    actualCost: z.number().finite().min(0).max(1e8).nullable(),
    source: z.string().trim().min(3).max(500),
    note: z.string().max(2000).default(''),
    expectedRevision: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const allowed =
      value.kind === 'lead'
        ? ['new', 'qualified', 'won', 'lost']
        : ['new', 'delivered', 'returned', 'failed'];
    if (!allowed.includes(value.status))
      ctx.addIssue({
        code: 'custom',
        path: ['status'],
        message: 'Choose a status for the selected lead/order type.',
      });
    if (
      ['new', 'qualified', 'lost', 'failed'].includes(value.status) &&
      (value.receivedRevenue !== 0 || value.refunds !== 0)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['receivedRevenue'],
        message: 'Record payments only for won, delivered or returned outcomes.',
      });
    if (value.refunds > value.receivedRevenue)
      ctx.addIssue({
        code: 'custom',
        path: ['refunds'],
        message: 'Refunds cannot exceed payments recorded for this outcome.',
      });
    if (value.observedOn > new Date(Date.now() + 14 * 3600000).toISOString().slice(0, 10))
      ctx.addIssue({
        code: 'custom',
        path: ['observedOn'],
        message: 'Outcome dates cannot be in the future.',
      });
  });
export const periodSchema = z
  .object({ from: date, to: date })
  .strict()
  .refine((value) => value.from <= value.to, 'Choose a valid date range');

export async function saveOutcome(platform, user, input) {
  const campaign = await platform.owned('campaigns', input.campaignId, user);
  const plan = await platform.owned('campaign_plans', campaign.planId, user);
  const integration = await platform.integration(user.businessId);
  const currentDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: integration?.timezone || 'Asia/Dhaka',
  }).format(new Date());
  assert(
    input.observedOn <= currentDay,
    422,
    'OUTCOME_DATE',
    'Outcome dates cannot be in the future in the connected account timezone',
  );
  assert(
    input.kind === (plan.conversionEvent === 'LEAD' ? 'lead' : 'order'),
    422,
    'OUTCOME_KIND',
    'Record leads for a lead campaign and orders for a purchase campaign',
  );
  const persist = () =>
    platform.store.transaction(async () => {
      const identity = {
        businessId: user.businessId,
        campaignId: input.campaignId,
        reference: input.reference,
      };
      const existing = await platform.store.find('business_outcomes', identity);
      assert(
        input.expectedRevision === undefined || existing?.revision === input.expectedRevision,
        409,
        'OUTCOME_CHANGED',
        'This outcome changed in another session. Reload the latest entry before editing it.',
      );
      const { expectedRevision, ...facts } = input;
      const data = {
        ...facts,
        ...identity,
        currency: plan.accountCurrency || 'BDT',
        revision: (existing?.revision || 0) + 1,
        recordedBy: user.id,
        voidedAt: null,
        classification: 'user-observed',
        demo: campaign.demo === true || platform.config.mode === 'demo',
      };
      const saved = existing
        ? await platform.store.update('business_outcomes', existing.id, data)
        : await platform.store.insert('business_outcomes', data);
      const amounts = (row) =>
        row
          ? {
              status: row.status,
              receivedRevenue: row.receivedRevenue,
              refunds: row.refunds,
              actualCost: row.actualCost,
              revision: row.revision,
            }
          : null;
      await platform.audit(user, existing ? 'outcome.updated' : 'outcome.created', saved.id, {
        campaignId: campaign.id,
        reference: saved.reference,
        before: amounts(existing),
        after: amounts(saved),
      });
      return saved;
    });
  try {
    return await persist();
  } catch (error) {
    if (error.code === 11000) return persist();
    throw error;
  }
}
export async function voidOutcome(platform, user, id) {
  platform.requireApprover(user);
  return platform.store.transaction(async () => {
    const row = await platform.owned('business_outcomes', id, user);
    const saved = await platform.store.update('business_outcomes', row.id, {
      voidedAt: now(),
      revision: (row.revision || 0) + 1,
    });
    await platform.audit(user, 'outcome.voided', row.id);
    return saved;
  });
}

export async function actualResults(platform, user, period) {
  const campaigns = await platform.store.list('campaigns', { businessId: user.businessId });
  const outcomes = (
    await platform.store.list('business_outcomes', { businessId: user.businessId })
  ).filter((row) => !row.voidedAt && row.observedOn >= period.from && row.observedOn <= period.to);
  const lifetimePerformance = (
    await platform.store.list('ad_performance', { businessId: user.businessId })
  ).filter((row) => row.level === 'campaign');
  const performance = lifetimePerformance.filter(
    (row) => row.date >= period.from && row.date <= period.to,
  );
  const results = [];
  for (const campaign of campaigns) {
    const plan = await platform.owned('campaign_plans', campaign.planId, user);
    const facts = outcomes.filter((row) => row.campaignId === campaign.id);
    const meta = performance.filter((row) => row.campaignId === campaign.id);
    const spend = meta.length ? money(meta.reduce((sum, row) => sum + row.spend, 0)) : null;
    const revenue = facts.length
      ? money(facts.reduce((sum, row) => sum + row.receivedRevenue - row.refunds, 0))
      : null;
    const cost =
      facts.length && facts.every((row) => row.actualCost !== null)
        ? money(facts.reduce((sum, row) => sum + row.actualCost, 0))
        : null;
    const won = facts.filter((row) => ['won', 'delivered'].includes(row.status)).length;
    const qualified = facts.filter(
      (row) => row.kind === 'lead' && ['qualified', 'won'].includes(row.status),
    ).length;
    const failed = facts.filter((row) => ['returned', 'failed'].includes(row.status)).length;
    results.push({
      campaignId: campaign.id,
      name: campaign.name,
      currency: plan.accountCurrency || 'BDT',
      outcomeCount: facts.length,
      qualifiedLeads: qualified,
      confirmedSales: won,
      failedOrReturned: failed,
      adSpend: spend,
      receivedRevenue: revenue,
      actualCost: cost,
      contributionAfterAds:
        spend !== null && cost !== null && revenue !== null ? money(revenue - cost - spend) : null,
      costPerConfirmedSale: spend !== null && won > 0 ? money(spend / won) : null,
      costPerQualifiedLead: spend !== null && qualified > 0 ? money(spend / qualified) : null,
      spendSyncedAt:
        meta
          .map((row) => row.syncedAt)
          .filter(Boolean)
          .sort()
          .at(-1) || null,
      status: campaign.status,
      dailyBudget: campaign.dailyBudget,
      totalBudgetCeiling: campaign.totalBudget,
      synchronizedLifetimeSpend: lifetimePerformance.some((row) => row.campaignId === campaign.id)
        ? money(
            lifetimePerformance
              .filter((row) => row.campaignId === campaign.id)
              .reduce((sum, row) => sum + row.spend, 0),
          )
        : null,
      decision:
        facts.length === 0 || spend === null
          ? 'Record outcomes and sync spend before judging the test.'
          : won === 0
            ? 'No confirmed sales recorded. Review lead quality and offer before increasing budget.'
            : cost === null
              ? 'Record actual delivery costs before evaluating profitability or scaling.'
              : revenue - cost - spend <= 0
                ? 'Recorded contribution does not cover advertising. Review costs and offer before spending more.'
                : 'Recorded contribution is positive. A small sample alone is insufficient evidence to scale.',
      demo: platform.config.mode === 'demo',
    });
  }
  return {
    period,
    results,
    outcomes,
    evidence:
      'User-recorded outcomes and synchronized campaign-level Meta spend. Incomplete records may understate costs or revenue. No cross-currency aggregation.',
  };
}

// Prevent CSV formulas supplied through campaign names, notes or references.
export function outcomeCsv(rows) {
  const columns = [
    'reference',
    'campaignId',
    'kind',
    'status',
    'observedOn',
    'currency',
    'receivedRevenue',
    'refunds',
    'actualCost',
    'source',
    'note',
  ];
  const escape = (value) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [columns, ...rows.map((row) => columns.map((key) => row[key]))]
    .map((row) => row.map(escape).join(','))
    .join('\r\n');
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.js';
import { projectSchema, briefOf } from '../src/modules/research/workbench.js';
import { saveAdLibraryObservation } from '../src/modules/research/ad-library.js';

const comparison = {
  summary: 'Validate buyer need and actual costs before a small product test.',
  countries: [
    {
      country: 'BD',
      opportunity: 'Investigate local buyer need.',
      buyerSegments: ['Local bag buyers'],
      competition: 'Saved ads are a sample and not proof of profitable demand.',
      languages: ['Bangla'],
      advantages: [],
      risks: ['Failed COD deliveries'],
      testApproach: 'Check quality and measure delivered orders.',
      confidence: 'Low',
    },
  ],
  findings: [],
  recommendation: {
    country: null,
    reason: 'Buyer and acquisition evidence is still needed.',
    nextSteps: ['Validate a supplier sample.'],
  },
  openQuestions: ['Which comparable offers and delivery terms actually apply?'],
};

test('physical product validation reuses saved facts/ads and cached research, while a changed goal requires a fresh analysis', async () => {
  const f = await fixture();
  try {
    const ad = await saveAdLibraryObservation(f.platform, f.user, {
      adUrl: '813456789',
      pageName: 'Local shop',
      country: 'BD',
      productId: f.product.id,
      observedAt: new Date().toISOString(),
      adCopy: 'Observed canvas bag offer.',
    });
    const calls = [];
    f.platform.llm.generate = async (task, context) => {
      calls.push({ task, context });
      return task === 'market-comparison' ? structuredClone(comparison) : null;
    };
    const project = await f.research.create(
      f.user,
      projectSchema.parse({
        name: f.product.name,
        kind: 'physical-product',
        productId: f.product.id,
        productCategory: 'Accessories',
        researchGoal: 'business-decision',
        description: f.product.description,
        buyerProfile: 'Bangladesh bag buyers',
        candidateCountries: ['BD'],
        adLibraryIds: [ad.id],
      }),
    );
    const first = await f.research.research(f.user, project.id);
    const second = await f.research.research(f.user, project.id);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].task, 'market-comparison');
    assert.equal(calls[0].context.productValidation.researchGoal, 'business-decision');
    assert.equal(
      calls[0].context.productValidation.unitEconomics.sellingPrice,
      f.product.sellingPrice,
    );
    assert.equal(calls[0].context.linkedProduct.inventory, f.product.inventory);
    assert.equal(calls[0].context.adLibraryObservations[0].id, ad.id);
    assert.match(calls[0].context.productValidation.rules, /COD failures/);
    assert.equal(second.report.researchReuse.cached, true);
    assert.notEqual(first.id, second.id);
    await f.research.update(f.user, project.id, {
      ...briefOf(project),
      researchGoal: 'pricing-profit',
    });
    await f.research.research(f.user, project.id);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].context.productValidation.researchGoal, 'pricing-profit');
  } finally {
    await f.close();
  }
});

test('digital research keeps service/software context and legacy briefs remain valid without product-only fields', async () => {
  const f = await fixture();
  try {
    const input = {
      name: 'Custom ecommerce',
      kind: 'service',
      description: 'Custom ecommerce software for retailers.',
      buyerProfile: 'Retail business owners',
      candidateCountries: ['BD'],
    };
    const parsed = projectSchema.parse(input);
    assert.equal(parsed.researchGoal, undefined);
    assert.equal(parsed.productCategory, undefined);
    const project = await f.research.create(f.user, parsed);
    let context;
    f.platform.llm.generate = async (_task, next) => {
      context = next;
      return structuredClone(comparison);
    };
    await f.research.research(f.user, project.id);
    assert.equal(context.project.kind, 'service');
    assert.equal(context.productValidation, undefined);
    assert.equal(context.linkedProduct, null);
  } finally {
    await f.close();
  }
});

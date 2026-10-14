import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fixture, productInput } from './helpers.js';
import {
  campaignProductSources,
  savedProductResearch,
} from '../src/modules/campaigns/product-sources.js';
import { createProductGroup } from '../src/modules/campaigns/product-group.js';
import { projectSchema } from '../src/modules/research/workbench.js';
import { saveAdLibraryObservation } from '../src/modules/research/ad-library.js';
import { deletionPreview, deleteManagedRecord } from '../src/modules/records.js';

const ready = (name) => ({
  ...structuredClone(productInput),
  name,
  landingUrl: 'https://shop.example/product',
  imageUrl: 'https://shop.example/product.png',
});
const brief = (changes = {}) =>
  projectSchema.parse({
    name: 'Researched bag',
    kind: 'physical-product',
    productCategory: 'Accessories',
    description: 'Investigate a real bag and compare comparable offers.',
    buyerProfile: 'Local bag buyers',
    candidateCountries: ['BD'],
    ...changes,
  });

test('product sources reuse existing products and expose only safe competitor/research drafts', async () => {
  const f = await fixture();
  try {
    const project = await f.research.create(f.user, brief({ productId: f.product.id }));
    const ad = await saveAdLibraryObservation(f.platform, f.user, {
      adUrl: '934567819',
      pageName: 'Competing shop',
      country: 'BD',
      observedAt: new Date().toISOString(),
      adCopy: 'Competitor price 999 BDT.',
    });
    const discovery = await f.store.insert('product_discoveries', {
      businessId: f.user.businessId,
      input: { country: 'BD', adLibraryIds: [ad.id] },
      report: {
        candidates: [
          {
            id: randomUUID(),
            name: 'Idea bag',
            category: 'Accessories',
            reason: 'Unvalidated idea',
          },
        ],
      },
    });
    await f.research.create(f.user, brief({ name: 'Digital service', kind: 'service' }));
    const before = (await f.store.list('products')).length;
    const catalog = await campaignProductSources(f.platform, f.user);
    const research = catalog.sources.find((row) => row.reference.id === project.id);
    assert.equal(research.existingProductId, f.product.id);
    assert(!catalog.sources.some((row) => row.name === 'Digital service'));
    const competitor = catalog.sources.find((row) => row.reference.id === ad.id);
    assert.deepEqual(competitor.draft.adLibraryIds, [ad.id]);
    for (const field of [
      'name',
      'description',
      'sellingPrice',
      'imageUrl',
      'mediaAssetId',
      'landingUrl',
    ])
      assert.equal(competitor.draft[field], undefined);
    const candidate = catalog.sources.find((row) => row.reference.id === discovery.id);
    assert.equal(candidate.draft.name, 'Idea bag');
    assert.equal(candidate.draft.description, '');
    assert.equal((await f.store.list('products')).length, before);
    assert(
      catalog.products
        .find((row) => row.id === f.product.id)
        .carouselMissing.includes('product image'),
    );
    const actual = await f.platform.createProduct(f.user, {
      ...ready('My actual bag'),
      sourceContext: candidate.reference,
    });
    const refreshed = await campaignProductSources(f.platform, f.user);
    assert.equal(
      refreshed.sources.find((row) => row.key === candidate.key).existingProductId,
      actual.id,
    );
    const origin = await f.platform.createProduct(f.user, {
      ...ready('Another research variant'),
      sourceContext: { kind: 'research', id: project.id },
    });
    assert.notEqual(origin.id, actual.id);
    const explicit = await f.platform.createProduct(f.user, ready('Explicitly linked product'));
    await f.store.update('research_projects', project.id, { productId: explicit.id });
    assert.equal(
      (await campaignProductSources(f.platform, f.user)).sources.find(
        (row) => row.reference.id === project.id,
      ).existingProductId,
      explicit.id,
    );
  } finally {
    await f.close();
  }
});

test('source references reject foreign assets, digital research and missing discovery candidates', async () => {
  const f = await fixture();
  try {
    const foreign = await f.store.insert('research_projects', {
      businessId: randomUUID(),
      kind: 'physical-product',
    });
    await assert.rejects(
      f.platform.createProduct(f.user, {
        ...ready('Foreign'),
        sourceContext: { kind: 'research', id: foreign.id },
      }),
      { code: 'NOT_FOUND' },
    );
    const service = await f.research.create(f.user, brief({ kind: 'service' }));
    await assert.rejects(
      f.platform.createProduct(f.user, {
        ...ready('Service'),
        sourceContext: { kind: 'research', id: service.id },
      }),
      { code: 'PRODUCT_SOURCE_KIND' },
    );
    const discovery = await f.store.insert('product_discoveries', {
      businessId: f.user.businessId,
      report: { candidates: [] },
    });
    await assert.rejects(
      f.platform.createProduct(f.user, {
        ...ready('Missing idea'),
        sourceContext: { kind: 'discovery', id: discovery.id, candidateId: randomUUID() },
      }),
      { code: 'PRODUCT_SOURCE_CANDIDATE' },
    );
  } finally {
    await f.close();
  }
});

test('carousel research receives saved report context; a changed decision blocks old approval and new research succeeds', async () => {
  const f = await fixture();
  try {
    const project = await f.research.create(f.user, brief());
    const version = await f.research.research(f.user, project.id);
    const first = await f.platform.createProduct(f.user, {
      ...ready('First bag'),
      sourceContext: { kind: 'research', id: project.id },
    });
    const second = await f.platform.createProduct(f.user, ready('Second bag'));
    const input = {
      productIds: [first.id, second.id],
      name: 'Shared bag test',
      landingUrl: 'https://shop.example/bags',
      dailyBudget: 200,
      durationDays: 5,
    };
    const contexts = [];
    const original = f.platform.llm.generate.bind(f.platform.llm);
    f.platform.llm.generate = async (...args) => {
      contexts.push({ task: args[0], context: args[1] });
      return original(...args);
    };
    const plan = await createProductGroup(f.platform, f.user, input);
    const context = contexts.find((row) => row.task === 'bangladesh-market-research').context
      .product.savedResearchContext;
    assert.equal(context[0].versionId, version.id);
    assert.equal(context[0].summary, version.report.summary);
    assert.match(context[0].classification, /not.*proven demand|hypotheses/);
    assert.equal(plan.campaignStructure.campaignCount, 1);
    assert.equal(plan.budgetRecommendation.totalBudget, 1000);
    assert.equal(plan.ads[0].cards.length, 2);
    await f.platform.assertFresh(plan, f.user);
    const approval = await f.platform.submitPlan(f.user, plan.id, 'manual');
    await f.platform.decide(
      f.user,
      approval.id,
      'approve',
      'Reviewed this bounded carousel guide without launching ads.',
    );
    const approved = await f.store.get('approval_requests', approval.id);
    const historical = structuredClone(approved.snapshot);
    await f.research.update(
      f.user,
      project.id,
      brief({ questions: 'New evidence requires a revised decision.' }),
    );
    await assert.rejects(f.platform.submitPlan(f.user, plan.id, 'manual'), {
      code: 'PRODUCT_RESEARCH_CHANGED',
    });
    assert.equal((await f.store.get('campaign_plans', plan.id)).status, 'needs_research');
    const superseded = await f.store.get('approval_requests', approval.id);
    assert.equal(superseded.status, 'superseded');
    assert.deepEqual(superseded.snapshot, historical);
    const replacement = await createProductGroup(f.platform, f.user, input);
    assert.notEqual(
      replacement.research.productResearchFingerprint,
      plan.research.productResearchFingerprint,
    );
    assert.equal(f.meta.calls.length, 0);
  } finally {
    await f.close();
  }
});

test('deleting a research source detaches its pointer and preserves the independent actual product', async () => {
  const f = await fixture();
  try {
    const source = await f.research.create(f.user, brief());
    const product = await f.platform.createProduct(f.user, {
      ...ready('Independent inventory'),
      sourceContext: { kind: 'research', id: source.id },
    });
    const preview = await deletionPreview(f.platform, f.user, 'research', source.id);
    await deleteManagedRecord(f.platform, f.user, 'research', source.id, preview.token);
    const actual = await f.platform.owned('products', product.id, f.user);
    assert.equal(actual.sourceContext, null);
    assert.equal(actual.sellingPrice, product.sellingPrice);
    assert.deepEqual(await savedProductResearch(f.platform, f.user, [actual]), []);
  } finally {
    await f.close();
  }
});

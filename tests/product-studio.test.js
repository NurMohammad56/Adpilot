import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import { fixture, productInput } from './helpers.js';
import { autoProductCosts } from '../src/modules/pricing/product-calculator.js';
import { calculateEconomics } from '../src/modules/pricing/engine.js';
import { createProductGroup } from '../src/modules/campaigns/product-group.js';
import { LiveMetaAdapter } from '../src/integrations/meta/adapter.js';
import { analyzeProductImages, visualOutputSchema } from '../src/modules/media/vision.js';
import { OpenAIProvider } from '../src/ai/openai.js';
import { explainConfidence } from '../src/modules/research/confidence.js';
import { createApp } from '../src/app.js';
import {
  createCatalogFeed,
  resolveCatalogFeed,
  catalogXML,
  catalogImage,
} from '../src/modules/media/catalog.js';
import { hash } from '../src/utils/core.js';
import { enqueueProductGroup, runProductGroupJob } from '../src/modules/campaigns/group-jobs.js';
import { projectSchema } from '../src/modules/research/workbench.js';
const planning = {
  mode: 'automatic',
  returnRateSource: 'assumed',
  returnShippingCost: 40,
  profitReserveRatio: 0.3,
  acknowledged: true,
};
const readyInput = (changes = {}) => ({
  ...structuredClone(productInput),
  condition: 'new',
  landingUrl: 'https://shop.example/tote',
  imageUrl: 'https://shop.example/tote.jpg',
  ...changes,
});
async function groupFixture() {
  const f = await fixture();
  const first = await f.platform.updateProduct(f.user, f.product.id, readyInput());
  const second = await f.platform.createProduct(
    f.user,
    readyInput({
      name: 'Daily backpack',
      sellingPrice: 1800,
      landingUrl: 'https://shop.example/backpack',
      imageUrl: 'https://shop.example/backpack.jpg',
    }),
  );
  return {
    ...f,
    first,
    second,
    input: {
      productIds: [first.id, second.id],
      name: 'Everyday bags',
      landingUrl: 'https://shop.example/bags',
      dailyBudget: 200,
      durationDays: 5,
    },
  };
}
test('automatic costs recompute shipping loss and reserve profit without inventing market CPA', () => {
  const p = autoProductCosts({ ...structuredClone(productInput), costPlanning: planning });
  assert.equal(p.costs.returnCost, 170);
  assert.equal(p.costs.returnRate, 0.1);
  assert.equal(p.minProfit, 240.33);
  assert.equal(p.desiredMargin, p.minProfit / 1500);
  const e = calculateEconomics(p);
  assert.equal(e.expectedReturnCost, 18.89);
  assert.equal(e.targetCPA, 560.78);
  assert.equal(e.contributionAtTargetCPA, 240.33);
  const moved = autoProductCosts({ ...p, costs: { ...p.costs, packaging: 100 } });
  assert(moved.minProfit < p.minProfit);
  assert(moved.costs.returnCost > p.costs.returnCost);
  const prepaid = autoProductCosts({ ...p, paymentMethod: 'prepaid' });
  assert.equal(prepaid.costs.returnRate, 0.05);
  const actual = autoProductCosts({
    ...p,
    costs: { ...p.costs, returnRate: 0.2 },
    costPlanning: { ...planning, returnRateSource: 'measured' },
  });
  assert.equal(actual.costs.returnRate, 0.2);
  const loss = calculateEconomics({ ...p, sellingPrice: 100 });
  assert.equal(loss.targetCPA, 0);
  assert.equal(loss.viable, false);
  const customerPaid = autoProductCosts({
    ...p,
    costPlanning: { ...planning, courierCharge: 100, customerDeliveryCharge: 100 },
  });
  assert.equal(customerPaid.costs.delivery, 0);
  assert.equal(customerPaid.costs.returnCost, 190);
  const withFee = autoProductCosts({
    ...customerPaid,
    costs: { ...customerPaid.costs, paymentPercent: 1 },
  });
  assert.equal(withFee.costs.delivery, 1);
  assert.equal(withFee.costs.returnCost, 190);
});
test('server ignores stale automatic totals and requires assumption acknowledgment', async () => {
  const f = await fixture();
  try {
    const p = await f.platform.createProduct(f.user, {
      ...readyInput(),
      costPlanning: planning,
      minProfit: 9999,
      desiredMargin: 0.8,
    });
    assert.equal(p.minProfit, 240.33);
    assert.notEqual(p.desiredMargin, 0.8);
    await assert.rejects(
      f.platform.createProduct(f.user, {
        ...readyInput(),
        costPlanning: { ...planning, acknowledged: false },
      }),
      { code: 'COST_ASSUMPTIONS' },
    );
    await assert.rejects(
      f.platform.createProduct(f.user, {
        ...readyInput(),
        costPlanning: { ...planning, courierCharge: 80, customerDeliveryCharge: 100 },
      }),
      { code: 'DELIVERY_CHARGE' },
    );
  } finally {
    await f.close();
  }
});
test('carousel has one shared budget, per-product economics and invalidates changed secondary product', async () => {
  const f = await groupFixture();
  try {
    const plan = await createProductGroup(f.platform, f.user, f.input);
    assert.equal(plan.validation.valid, true);
    assert.equal(plan.ads.length, 1);
    assert.equal(plan.ads[0].cards.length, 2);
    assert.equal(plan.budgetRecommendation.totalBudget, 1000);
    assert.equal(plan.budgetRecommendation.deliveryMode, 'lifetime');
    assert.equal(plan.pricingRecommendation.sellingPrice, null);
    assert.equal(plan.budgetRecommendation.plannedAcquisitions, null);
    assert.equal(
      plan.pricingRecommendation.targetCPA,
      Math.min(...plan.productMembers.map((m) => m.economics.targetCPA)),
    );
    const approval = await f.platform.submitPlan(f.user, plan.id, 'manual');
    await f.platform.decide(
      f.user,
      approval.id,
      'approve',
      'Owner approves this guide only, no spend',
    );
    assert.equal(f.meta.calls.length, 0);
    await f.platform.updateProduct(
      f.user,
      f.second.id,
      readyInput({ name: f.second.name, sellingPrice: 1900 }),
    );
    await assert.rejects(f.platform.assertFresh(plan, f.user), { code: 'STALE_PLAN' });
  } finally {
    await f.close();
  }
});
test('groups reject duplicates, missing price, disjoint coverage, foreign products and card tampering', async () => {
  const f = await groupFixture();
  try {
    await assert.rejects(
      createProductGroup(f.platform, f.user, { ...f.input, productIds: [f.first.id, f.first.id] }),
      { code: 'GROUP_PRODUCTS' },
    );
    await f.platform.updateProduct(f.user, f.second.id, readyInput({ sellingPrice: null }));
    await assert.rejects(createProductGroup(f.platform, f.user, f.input), {
      code: 'GROUP_PRODUCT_READY',
    });
    await f.platform.updateProduct(f.user, f.first.id, readyInput({ deliveryRegions: ['Dhaka'] }));
    await f.platform.updateProduct(
      f.user,
      f.second.id,
      readyInput({ deliveryRegions: ['Chattogram'] }),
    );
    await assert.rejects(createProductGroup(f.platform, f.user, f.input), {
      code: 'GROUP_COVERAGE',
    });
    await f.platform.updateProduct(f.user, f.second.id, readyInput({ deliveryRegions: ['Dhaka'] }));
    const plan = await createProductGroup(f.platform, f.user, f.input);
    const ads = structuredClone(plan.ads);
    ads[0].cards[1].sellingPrice = 1;
    await assert.rejects(f.platform.revisePlan(f.user, plan.id, { ads }), {
      code: 'CAROUSEL_PRODUCTS',
    });
    const other = await f.auth.createWorkspace(f.user, 'Other tenant');
    await assert.rejects(
      createProductGroup(f.platform, { ...f.user, businessId: other.id }, f.input),
      { code: 'NOT_FOUND' },
    );
  } finally {
    await f.close();
  }
});
test('carousel revision supersedes review and respects total budget ceiling', async () => {
  const f = await groupFixture();
  try {
    const plan = await createProductGroup(f.platform, f.user, f.input),
      pending = await f.platform.submitPlan(f.user, plan.id, 'manual');
    const updated = await f.platform.revisePlan(f.user, plan.id, {
      dailyBudget: 100,
      durationDays: 4,
    });
    assert.equal(updated.budgetRecommendation.totalBudget, 400);
    assert.equal((await f.store.get('approval_requests', pending.id)).status, 'superseded');
    const excessive = await createProductGroup(f.platform, f.user, {
      ...f.input,
      dailyBudget: 2000,
      durationDays: 30,
    });
    assert.equal(excessive.validation.valid, false);
    await assert.rejects(f.platform.submitPlan(f.user, excessive.id, 'manual'), {
      code: 'INVALID_PLAN',
    });
  } finally {
    await f.close();
  }
});
test('live carousel payload uses actual card image hashes and destinations, never an invented bundle price', async () => {
  const f = await groupFixture();
  try {
    const plan = await createProductGroup(f.platform, f.user, f.input);
    const meta = new LiveMetaAdapter({}),
      story = await meta.creativeStory(
        plan.ads[0],
        plan,
        { adAccountId: '123', pageId: '456' },
        async () => {},
      );
    assert.equal(story.link_data.child_attachments.length, 2);
    assert.equal(story.link_data.child_attachments[1].link, f.second.landingUrl);
    assert.equal(story.link_data.child_attachments[1].picture, f.second.imageUrl);
    assert.equal(story.link_data.multi_share_optimized, false);
    assert.equal(story.link_data.multi_share_end_card, false);
  } finally {
    await f.close();
  }
});
test('OpenAI receives actual image bytes as high detail multimodal input without logging them in context', async () => {
  const original = globalThis.fetch,
    requests = [];
  const result = {
    suggestedName: 'Bag',
    suggestedCategory: 'Accessories',
    suggestedDescription: 'A bag with visible handles.',
    observations: ['Two handles are visible.'],
    visibleText: [],
    uncertainClaims: ['Material cannot be confirmed.'],
    discrepancies: [],
    creativeSuggestions: ['Show the interior.'],
  };
  globalThis.fetch = async (_, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(
      JSON.stringify({
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] },
        ],
      }),
    );
  };
  try {
    const provider = new OpenAIProvider({
      llmKey: 'unit-test-key',
      llmModel: 'gpt-6-luna',
      thinkingLevel: 'high',
    });
    await provider.generate('product-image-analysis', { name: 'Bag' }, visualOutputSchema, {
      images: [{ mime: 'image/png', data: 'aW1hZ2U=' }],
    });
    assert.equal(requests[0].input[0].content[1].image_url, 'data:image/png;base64,aW1hZ2U=');
    assert.equal(requests[0].input[0].content[1].detail, 'high');
    assert.equal(requests[0].reasoning.effort, 'high');
    assert.equal(requests[0].store, false);
    assert(!requests[0].input[0].content[0].text.includes('aW1hZ2U='));
  } finally {
    globalThis.fetch = original;
  }
});
test('image analysis is workspace scoped, checksum bound, cached and rejects videos', async () => {
  const f = await fixture();
  try {
    const bytes = Buffer.from('image-test-bytes'),
      asset = await f.store.insert('media_assets', {
        businessId: f.user.businessId,
        status: 'ready',
        storageDriver: f.media.storage.driver,
        type: 'image',
        mime: 'image/png',
        checksum: hash(bytes),
        size: bytes.length,
        storageKey: 'test',
      });
    // readBytes uses actual SHA256 bytes, not core hash(JSON.stringify()).
    await f.store.update('media_assets', asset.id, {
      checksum: crypto.createHash('sha256').update(bytes).digest('hex'),
    });
    f.media.storage.bytes = async () => bytes;
    const one = await analyzeProductImages(f.platform, f.user, [asset.id], { name: 'Bag' });
    const two = await analyzeProductImages(f.platform, f.user, [asset.id], { name: 'Bag' });
    assert.equal(one.id, two.id);
    assert.equal(one.demo, true);
    const other = await f.auth.createWorkspace(f.user, 'Foreign');
    await assert.rejects(
      analyzeProductImages(f.platform, { ...f.user, businessId: other.id }, [asset.id]),
      { code: 'NOT_FOUND' },
    );
    await f.store.update('media_assets', asset.id, { type: 'video' });
    await assert.rejects(analyzeProductImages(f.platform, f.user, [asset.id]), {
      code: 'VISION_IMAGE',
    });
  } finally {
    await f.close();
  }
});
test('confidence cannot be upgraded by AI claims or pictures alone and explains measured history', () => {
  const make = (i) => ({
    source: `https://source${i}.example/research`,
    verifiedBy: 'owner',
    classification: 'observed',
    quality: 'Verified data',
    observedAt: new Date().toISOString(),
  });
  assert.equal(
    explainConfidence({
      findings: [{ ...make(1), verifiedBy: undefined }],
      visualAnalysis: {},
      retrieval: { sourceCount: 20 },
    }).level,
    'Low',
  );
  assert.equal(explainConfidence({ findings: [make(1), make(2)] }).level, 'Medium');
  assert.equal(
    explainConfidence({
      findings: [make(1), make(2), make(3)],
      actualResults: [{ confirmedSales: 20 }],
    }).level,
    'High',
  );
  assert.equal(
    explainConfidence({ findings: [{ ...make(1), observedAt: '2000-01-01T00:00:00Z' }, make(2)] })
      .level,
    'Low',
  );
});
test('catalogue feed is explicitly shared, escapes XML, remains tenant scoped and can be revoked', async () => {
  const f = await groupFixture();
  try {
    await assert.rejects(createCatalogFeed(f.platform, f.user, [f.first.id], false), {
      code: 'CATALOG_SHARING',
    });
    await assert.rejects(
      createCatalogFeed(f.platform, { ...f.user, role: 'analyst' }, [f.first.id], true),
      { code: 'ROLE_REQUIRED' },
    );
    await f.store.update('products', f.first.id, { name: 'Bag & <strong>quality</strong>' });
    const feed = await createCatalogFeed(f.platform, f.user, [f.first.id, f.second.id], true),
      token = new URL(feed.url).searchParams.get('token');
    const resolved = await resolveCatalogFeed(f.platform, feed.id, token),
      xml = await catalogXML(f.platform, resolved, token);
    assert(xml.includes('Bag &amp; &lt;strong&gt;quality&lt;/strong&gt;'));
    assert(xml.includes('1500.00 BDT'));
    assert(xml.includes(f.first.id));
    assert.equal((xml.match(/<item>/g) || []).length, 2);
    await assert.rejects(resolveCatalogFeed(f.platform, feed.id, '0'.repeat(64)), {
      code: 'NOT_FOUND',
    });
    await assert.rejects(catalogImage(f.platform, resolved, 'foreign-asset'), {
      code: 'NOT_FOUND',
    });
    const app = createApp(f);
    assert.equal((await request(app).get(new URL(feed.url).pathname)).status, 404);
    const response = await request(app).get(new URL(feed.url).pathname).query({ token });
    assert.equal(response.status, 200);
    assert.match(response.type, /xml/);
    const bytes = Buffer.from('catalog-test-image'),
      checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    const asset = await f.store.insert('media_assets', {
      businessId: f.user.businessId,
      status: 'ready',
      storageDriver: f.media.storage.driver,
      type: 'image',
      mime: 'image/png',
      checksum,
      size: bytes.length,
      storageKey: 'test',
    });
    f.media.storage.bytes = async () => bytes;
    await f.store.update('products', f.first.id, { mediaAssetId: asset.id });
    const withImage = await catalogXML(f.platform, resolved, token);
    assert(withImage.includes(`/images/${asset.id}?token=`));
    const imagePath = new URL(feed.url).pathname.replace('/feed.xml', `/images/${asset.id}`);
    const image = await request(app).get(imagePath).query({ token });
    assert.equal(image.status, 200);
    assert.equal(image.type, 'image/png');
    assert.deepEqual(image.body, bytes);
    assert.equal(
      (
        await request(app)
          .get(imagePath)
          .query({ token: '0'.repeat(64) })
      ).status,
      404,
    );
    await f.store.update('catalog_feeds', feed.id, { status: 'revoked' });
    assert.equal((await request(app).get(new URL(feed.url).pathname).query({ token })).status, 404);
    assert.equal((await request(app).get(imagePath).query({ token })).status, 404);
  } finally {
    await f.close();
  }
});

test('queued carousel research deduplicates requests, binds snapshots and reuses completed results', async () => {
  const f = await groupFixture(),
    calls = [];
  try {
    const runtime = { ...f, jobs: { queue: { add: async (...args) => calls.push(args) } } };
    const first = await enqueueProductGroup(runtime, f.user, f.input),
      again = await enqueueProductGroup(runtime, f.user, f.input);
    assert.equal(first.id, again.id);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2].attempts, 1);
    const plan = await runProductGroupJob(f.platform, first),
      repeated = await runProductGroupJob(f.platform, first);
    assert.equal(plan.id, repeated.id);
    assert.equal(plan.planningJobId, first.id);
    await f.store.update('jobs', first.id, { status: 'completed' });
    const next = await enqueueProductGroup(runtime, f.user, f.input);
    await f.platform.updateProduct(f.user, f.second.id, readyInput({ sellingPrice: 2000 }));
    await assert.rejects(runProductGroupJob(f.platform, next), { code: 'STALE_JOB' });
  } finally {
    await f.close();
  }
});

test('linked product research detects edits before approval and before campaign use', async () => {
  const f = await fixture();
  try {
    const project = await f.research.create(
      f.user,
      projectSchema.parse({
        name: 'Bag market comparison',
        kind: 'physical-product',
        productId: f.product.id,
        description: f.product.description,
        buyerProfile: 'Local shoppers seeking a durable everyday bag.',
        candidateCountries: ['BD'],
        questions: 'Check product fit.',
        evidence: [],
      }),
    );
    const version = await f.research.research(f.user, project.id);
    const edited = await f.research.edit(f.user, version.id, {
      summary: version.report.summary,
      recommendation: {
        ...version.report.recommendation,
        country: 'BD',
        reason: 'Owner selects a limited Bangladesh validation test.',
      },
      note: 'Review a small test with known uncertainties.',
    });
    await f.research.submit(f.user, edited.id);
    await f.research.decide(f.user, edited.id, 'approve', 'Reviewed linked product');
    await f.platform.updateProduct(f.user, f.product.id, readyInput({ sellingPrice: 1600 }));
    await assert.rejects(f.research.approved(f.user, edited.id), {
      code: 'STALE_PRODUCT_RESEARCH',
    });
    await assert.rejects(
      f.research.edit(f.user, edited.id, {
        summary: edited.report.summary,
        recommendation: edited.report.recommendation,
        note: 'Change conclusion without researching the new product.',
      }),
      { code: 'STALE_PRODUCT_RESEARCH' },
    );
  } finally {
    await f.close();
  }
});

import { AuthService } from './modules/auth/service.js';
export async function seedDemo(store, platform) {
  if (await store.find('users', { email: 'demo@adpilot.local' })) return;
  const auth = new AuthService(store);
  const user = await auth.register({
    name: 'Ayesha Rahman',
    email: 'demo@adpilot.local',
    password: 'DemoAccess2026!',
    businessName: 'Everyday Goods BD',
  });
  await platform.updateBusiness(user, {
    name: 'Everyday Goods BD',
    location: 'Dhaka, Bangladesh',
    dailyBudgetCeiling: 3500,
    totalBudgetCeiling: 24500,
    deliveryRegions: ['Dhaka', 'Chattogram', 'Sylhet'],
  });
  const base = {
    costs: {
      product: 500,
      packaging: 45,
      delivery: 80,
      paymentFixed: 20,
      paymentPercent: 1,
      other: 25,
      returnRate: 0.1,
      returnCost: 160,
    },
    inventory: 250,
    minProfit: 200,
    desiredMargin: 0.2,
    sellingPrice: 1490,
    landingUrl: '',
    imageUrl: '',
    dailyBudgetCeiling: 1500,
    testBudgetCeiling: 10500,
  };
  const first = await platform.createProduct(user, {
    ...base,
    name: 'Everyday Canvas Tote',
    category: 'Lifestyle & accessories',
    description:
      'A reusable canvas tote for everyday carrying. Natural cotton canvas, reinforced handles and an inside pocket.',
  });
  const second = await platform.createProduct(user, {
    ...base,
    name: 'Ceramic Coffee Set',
    category: 'Home & living',
    description:
      'A ceramic mug and saucer set for daily tea or coffee. Confirm materials and care instructions before advertising.',
    sellingPrice: 1690,
    costs: { ...base.costs, product: 640 },
    dailyBudgetCeiling: 1200,
    testBudgetCeiling: 8400,
  });
  await platform.createProduct(user, {
    ...base,
    name: 'Desk Organizer',
    category: 'Home & office',
    description:
      'A compact desk organizer with compartments for stationery. A practical desk accessory for home and office.',
    sellingPrice: 1190,
    costs: { ...base.costs, product: 400 },
    dailyBudgetCeiling: 1000,
    testBudgetCeiling: 7000,
  });
  const plan = await platform.createPlan(user, first.id);
  const approval = await platform.submitPlan(user, plan.id);
  await platform.decide(
    user,
    approval.id,
    'approve',
    'Simulated approval supplied by the demo fixture. No real advertising action.',
  );
  // Demo fixtures exercise the service directly; every interactive execution travels through MCP.
  const result = await platform.executeApproved(approval.id, 'create_campaign');
  await platform.syncInsights(user, result.campaignId);
  const pending = await platform.createPlan(user, second.id);
  await platform.submitPlan(user, pending.id);
  await platform.audit(user, 'demo.fixture_loaded', user.businessId, {
    synthetic: true,
    note: 'All seeded approvals, campaigns, research and performance are simulated.',
  });
}

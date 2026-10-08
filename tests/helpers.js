import { DemoStore } from '../src/db/store.js';
import { createRuntime } from '../src/runtime.js';
import { loadConfig } from '../src/config/index.js';
export const productInput = {
  name: 'Canvas Tote',
  category: 'Accessories',
  description: 'A cotton canvas tote with sturdy handles and an inside pocket.',
  costs: {
    product: 500,
    packaging: 50,
    delivery: 80,
    paymentFixed: 20,
    paymentPercent: 0,
    other: 30,
    returnRate: 0,
    returnCost: 160,
  },
  inventory: 100,
  minProfit: 200,
  desiredMargin: 0.2,
  sellingPrice: 1500,
  landingUrl: '',
  imageUrl: '',
  dailyBudgetCeiling: 1500,
  testBudgetCeiling: 10500,
};
export async function fixture(options = {}) {
  const store = new DemoStore();
  await store.connect();
  const config = loadConfig({ APP_MODE: 'demo', APP_ORIGIN: 'http://localhost:5173' });
  const runtime = await createRuntime({ store, config, seed: false, ...options });
  const user = await runtime.auth.register({
    name: 'Test Admin',
    email: 'admin@test.local',
    password: 'SecureTestPassword2026!',
    businessName: 'Test Business',
  });
  await runtime.platform.updateBusiness(user, {
    name: 'Test Business',
    location: 'Dhaka',
    dailyBudgetCeiling: 3000,
    totalBudgetCeiling: 21000,
    deliveryRegions: ['Dhaka', 'Chattogram'],
  });
  const product = await runtime.platform.createProduct(user, structuredClone(productInput));
  return { ...runtime, user, product };
}
export async function approved(f) {
  const plan = await f.platform.createPlan(f.user, f.product.id);
  const approval = await f.platform.submitPlan(f.user, plan.id);
  await f.platform.decide(f.user, approval.id, 'approve', 'Human approval in the test harness');
  return { plan, approval: await f.store.get('approval_requests', approval.id) };
}

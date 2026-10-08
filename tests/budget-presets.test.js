import test from 'node:test';
import assert from 'node:assert/strict';
import { createBudgetPresets } from '../src/modules/campaigns/budget-presets.js';
const clock = Date.parse('2026-10-08T16:00:00Z');
const response = (rates, timestamp = clock / 1000) => ({
  ok: true,
  json: async () => ({
    result: 'success',
    base_code: 'USD',
    rates,
    time_last_update_unix: timestamp,
  }),
});
test('a USD starter needs no exchange-rate request', async () => {
  const presets = createBudgetPresets({
    fetchImpl: () => {
      throw new Error('Unexpected network call');
    },
  });
  const value = await presets.get('USD');
  assert.equal(value.dailyBudget, 3);
  assert.equal(value.totalBudget, 21);
  assert.equal(value.source, null);
});
test('BDT and EUR presets use account currency with shared cached reference rates', async () => {
  let calls = 0;
  const presets = createBudgetPresets({
    now: () => clock,
    fetchImpl: async () => {
      calls++;
      return response({ BDT: 123.012003, EUR: 0.9 });
    },
  });
  const [bdt, eur] = await Promise.all([presets.get('BDT'), presets.get('EUR')]);
  assert.equal(bdt.currency, 'BDT');
  assert.equal(bdt.dailyBudget, 369.03);
  assert.equal(bdt.totalBudget, 2583.21);
  assert.equal(eur.dailyBudget, 2.7);
  assert.equal(calls, 1);
  await presets.get('BDT');
  assert.equal(calls, 1);
});
test('stale, missing, or invalid rates never label 3 account units as 3 USD', async () => {
  for (const value of [
    response({ BDT: 123 }, (clock - 3 * 86400000) / 1000),
    response({ EUR: 0.9 }),
    response({ BDT: -3 }),
  ]) {
    const presets = createBudgetPresets({ now: () => clock, fetchImpl: async () => value });
    const result = await presets.get('BDT');
    assert.equal(result.available, false);
    assert.equal(result.dailyBudget, null);
    assert.equal(result.totalBudget, null);
  }
});
test('network outage falls back to manual entry and retries after a bounded cooldown', async () => {
  let calls = 0,
    time = clock;
  const presets = createBudgetPresets({
    now: () => time,
    fetchImpl: async () => {
      calls++;
      if (calls === 1) throw new Error('Offline');
      return response({ BDT: 123 });
    },
  });
  assert.equal((await presets.get('BDT')).available, false);
  assert.equal((await presets.get('BDT')).available, false);
  assert.equal(calls, 1);
  time += 300001;
  assert.equal((await presets.get('BDT')).available, true);
  assert.equal(calls, 2);
});

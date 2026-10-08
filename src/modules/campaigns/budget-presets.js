// Reference FX only: never changes account currency, policy ceilings, or campaigns.
export function createBudgetPresets({ fetchImpl = fetch, now = Date.now } = {}) {
  let cached,
    refreshAt = 0,
    inflight;
  async function rates() {
    if (now() < refreshAt) return cached;
    if (inflight) return inflight;
    inflight = Promise.resolve().then(async () => {
      try {
        const response = await fetchImpl('https://open.er-api.com/v6/latest/USD', {
          signal: AbortSignal.timeout(5000),
          redirect: 'error',
        });
        if (!response.ok) throw new Error('Rate unavailable');
        const result = await response.json();
        const updated = result.time_last_update_unix * 1000;
        if (
          result.result !== 'success' ||
          result.base_code !== 'USD' ||
          !Number.isFinite(updated) ||
          updated > now() + 300000 ||
          now() - updated > 172800000
        )
          throw new Error('Invalid or stale rate');
        cached = { rates: result.rates, updatedAt: new Date(updated).toISOString() };
        refreshAt = now() + 3600000;
      } catch {
        cached = null;
        refreshAt = now() + 300000;
      } finally {
        inflight = null;
      }
      return cached;
    });
    return inflight;
  }
  return {
    async get(currency) {
      const base = { currency, usdDaily: 3, durationDays: 7 };
      const result = currency === 'USD' ? null : await rates();
      const rate = currency === 'USD' ? 1 : result?.rates?.[currency];
      if (!Number.isFinite(rate) || rate <= 0 || rate > 1e6)
        return { ...base, available: false, dailyBudget: null, totalBudget: null };
      const dailyBudget = Math.floor(3 * rate * 100) / 100;
      return {
        ...base,
        available: true,
        dailyBudget,
        totalBudget: Math.round(dailyBudget * 7 * 100) / 100,
        rate,
        rateUpdatedAt: result?.updatedAt || null,
        source: currency === 'USD' ? null : 'https://www.exchangerate-api.com',
      };
    },
  };
}

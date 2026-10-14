import React, { useState } from 'react';
import { Pagination, usePagination } from './Pagination.jsx';
export function CampaignReconciliation({ data, api, run, busy }) {
  const [results, setResults] = useState({});
  const rows = [
    ...data.campaigns.filter((r) => r.metaCampaignId).map((r) => ({ ...r, kind: 'api' })),
    ...data.manualCampaigns.map((r) => ({ ...r, kind: 'manual' })),
  ];
  const pagination = usePagination(rows, { pageSize: 5, resetKey: data.business.id });
  return (
    <section className="panel tools-panel">
      <h2>Compare saved settings with Meta</h2>
      <p>
        This check reads Meta settings. It does not change budgets, pause ads or activate campaigns.
        Differences require a fresh review.
      </p>
      {!rows.length && (
        <p>
          No launched or linked campaign is available yet. Link your manually created campaign ID or
          launch an approved plan first.
        </p>
      )}
      {pagination.items.map((row) => {
        const result = results[row.id] || row.reconciliation;
        return (
          <article className="guide-step" key={row.id}>
            <div className="operations-heading">
              <strong>{row.name}</strong>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const next = await api(
                      `/operations/campaigns/${row.kind}/${row.id}/reconcile`,
                      'POST',
                      {},
                    );
                    setResults((old) => ({ ...old, [row.id]: next }));
                  })
                }
              >
                Check campaign settings
              </button>
            </div>
            {result && (
              <>
                <p>
                  Status: {result.status} · {result.checkedAt}
                </p>
                {result.checks
                  ?.filter((c) => !c.matches)
                  .map((c, i) => (
                    <p className="notice" key={i}>
                      {c.field}: expected{' '}
                      {typeof c.expected === 'object'
                        ? JSON.stringify(c.expected)
                        : String(c.expected)}
                      ; Meta returned{' '}
                      {typeof c.actual === 'object' ? JSON.stringify(c.actual) : String(c.actual)}
                    </p>
                  ))}
                {result.pending?.map((message, i) => (
                  <p key={i}>{message}</p>
                ))}
              </>
            )}
          </article>
        );
      })}
      <Pagination pagination={pagination} label="Campaign checks" />
    </section>
  );
}

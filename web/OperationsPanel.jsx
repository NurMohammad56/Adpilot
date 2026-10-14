import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { CampaignField } from './FieldHelp.jsx';
import { useDraft } from './use-draft.js';
import './operations.css';
export function ResearchEstimate({ id, kind = 'research', run, busy }) {
  const [value, setValue] = useState(null);
  useEffect(() => setValue(null), [id]);
  return (
    <div className="guide-step">
      <button
        type="button"
        className="button secondary"
        disabled={busy}
        onClick={() =>
          run(async () => setValue(await api('/operations/estimate', 'POST', { kind, id })))
        }
      >
        Check research usage before starting
      </button>
      {value && (
        <p>
          Planning allowance: up to {value.reservedTokens.toLocaleString()} tokens ·{' '}
          {value.searchCalls} search operations ·{' '}
          {value.estimatedUsd === null
            ? 'USD estimate unavailable until provider prices are configured'
            : `Estimated allowance USD ${value.estimatedUsd.toFixed(4)}`}
          . {value.basis} Cached results can use less.
        </p>
      )}
    </div>
  );
}
export function ResearchJobTray({ data, refresh, run, busy }) {
  const [jobs, setJobs] = useState([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      timer;
    async function poll() {
      try {
        const result = await api('/data/jobs?limit=20');
        if (!active) return;
        setJobs(result.items.filter((r) => r.type === 'research-task'));
        setError('');
        if (
          result.items.some(
            (r) => r.type === 'research-task' && ['queued', 'running'].includes(r.status),
          )
        )
          timer = setTimeout(poll, 5000);
        else if (
          data.jobs.some(
            (r) => r.type === 'research-task' && ['queued', 'running'].includes(r.status),
          )
        )
          await refresh();
      } catch (e) {
        if (active) {
          setError(e.message);
          timer = setTimeout(poll, 15000);
        }
      }
    }
    if (
      data.jobs.some((r) => r.type === 'research-task' && ['queued', 'running'].includes(r.status))
    )
      poll();
    else setJobs(data.jobs.filter((r) => r.type === 'research-task').slice(-5));
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [data.business.id, data.jobs]);
  const visible = jobs.filter((r) => ['queued', 'running', 'failed'].includes(r.status));
  if (!visible.length && !error) return null;
  const stages = {
    waiting: 'Waiting for worker',
    'collecting-evidence': 'Collecting evidence',
    'analyzing-evidence': 'Analyzing evidence',
    'saving-result': 'Saving result',
  };
  return (
    <section className="panel operations-jobs" aria-label="Background research">
      <h3>Background research</h3>
      <p>
        Work continues when you close the browser. Return to the saved product or brief for its
        result.
      </p>
      {error && <p role="alert">{error}</p>}
      {visible.map((job) => (
        <div className="operations-job" key={job.id}>
          <div>
            <strong>{job.kind === 'research' ? 'Research brief' : 'Product plan'}</strong>
            <span>
              {job.status === 'failed'
                ? job.errorMessage || job.errorCode
                : stages[job.stage] || job.status}
            </span>
          </div>
          <progress value={job.progress || 0} max="100" aria-label="Research progress" />
          {job.status === 'failed' && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api(`/operations/jobs/${job.id}/retry`, 'POST', {});
                  await refresh();
                })
              }
            >
              Retry with current inputs
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
export function OperationsPanel({ data, run, busy }) {
  const [status, setStatus] = useState(null),
    [usage, setUsage] = useState(null),
    [error, setError] = useState('');
  const [policy, setPolicy] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:operations-policy`,
    null,
  );
  async function load() {
    const [s, u] = await Promise.all([api('/operations/system'), api('/operations/usage')]);
    setStatus(s);
    setUsage(u);
    setPolicy((current) => current || u.policy);
    setError('');
  }
  useEffect(() => {
    let active = true;
    Promise.all([api('/operations/system'), api('/operations/usage')])
      .then(([s, u]) => {
        if (active) {
          setStatus(s);
          setUsage(u);
          setPolicy((current) => current || u.policy);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [data.business.id]);
  return (
    <section className="panel settings-card operations-panel">
      <div className="operations-heading">
        <h2>System health & AI usage</h2>
        <button className="button secondary" disabled={busy} onClick={() => run(load)}>
          Refresh status
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {status && (
        <>
          <div className="operations-metrics">
            {Object.entries(status.health.dependencies).map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <strong className={value === 'unavailable' ? 'operations-error' : ''}>
                  {value}
                </strong>
              </div>
            ))}
            <div>
              <span>Failed jobs</span>
              <strong>{status.queue?.failed ?? 'Unavailable'}</strong>
            </div>
          </div>
          {status.alerts.map((a, i) => (
            <p className="notice" key={i}>
              {a.message}
            </p>
          ))}
          <p>
            Latest offsite backup:{' '}
            {status.backup
              ? new Date(status.backup.completedAt).toLocaleString('en-GB', {
                  timeZone: 'Asia/Dhaka',
                })
              : 'Not recorded'}{' '}
            · Restore verified:{' '}
            {status.backup?.restoreVerifiedAt
              ? new Date(status.backup.restoreVerifiedAt).toLocaleString('en-GB', {
                  timeZone: 'Asia/Dhaka',
                })
              : 'Not yet checked'}
          </p>
          <p className="small muted">
            {status.telemetry.requests} requests / 15 min · {status.telemetry.errors} server errors
            · p95 {Math.round(status.telemetry.p95Ms)} ms
          </p>
        </>
      )}
      {usage && policy && (
        <>
          <div className="operations-metrics">
            <div>
              <span>AI requests today</span>
              <strong>
                {usage.totals.dailyRequests} / {policy.dailyRequests}
              </strong>
            </div>
            <div>
              <span>AI requests this month</span>
              <strong>
                {usage.totals.monthlyRequests} / {policy.monthlyRequests}
              </strong>
            </div>
            <div>
              <span>Provider-reported tokens</span>
              <strong>{usage.totals.reportedTokens.toLocaleString()}</strong>
            </div>
            <div>
              <span>Monthly allowance used</span>
              <strong>
                {usage.totals.tokens.toLocaleString()} / {policy.monthlyTokens.toLocaleString()}
              </strong>
            </div>
          </div>
          <p>
            Cached reports use no new AI request. Allowance includes reservations for running or
            unreported usage. USD estimates require your provider prices; provider billing is
            authoritative.
          </p>
          {JSON.stringify(policy) !== JSON.stringify(usage.policy) && (
            <p className="notice">
              Your unfinished usage policy is shown. Save it to apply these limits, or reload the
              saved policy.
            </p>
          )}
          {data.user.role === 'admin' && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => setPolicy(usage.policy)}
            >
              Reload saved usage policy
            </button>
          )}
          {data.user.role === 'admin' && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                run(async () => {
                  await api('/operations/policy', 'PUT', policy);
                  await load();
                });
              }}
            >
              <div className="form-grid">
                {[
                  ['dailyRequests', 'AI requests per day', 1, 1000],
                  ['monthlyRequests', 'AI requests per month', 1, 10000],
                  ['monthlyTokens', 'Monthly token allowance', 10000, 100000000],
                  ['maxOutputTokens', 'Maximum output tokens per provider response', 2000, 32000],
                  ['refreshHours', 'Automatic refresh interval (hours)', 24, 720],
                ].map(([key, label, min, max]) => (
                  <CampaignField
                    key={key}
                    label={label}
                    help="Requests stop before starting when the remaining allowance is insufficient. Output includes reasoning tokens. Existing reports remain available."
                  >
                    <input
                      type="number"
                      required
                      min={min}
                      max={max}
                      value={policy[key]}
                      onChange={(e) => setPolicy({ ...policy, [key]: Number(e.target.value) })}
                    />
                  </CampaignField>
                ))}
              </div>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={policy.autoRefresh}
                  onChange={(e) => setPolicy({ ...policy, autoRefresh: e.target.checked })}
                />
                Enable automatic refresh of due product research (uses AI allowance)
              </label>
              <details>
                <summary>USD planning allowance & provider prices (optional)</summary>
                <p>
                  Use the highest applicable rates across your research and copy models. Do not
                  enter an assumed provider price.
                </p>
                <div className="form-grid">
                  {[
                    ['monthlyUsd', 'Monthly USD planning allowance'],
                    ['inputUsdPerMillion', 'Input USD per million tokens'],
                    ['outputUsdPerMillion', 'Output USD per million tokens'],
                    ['searchUsdPerCall', 'Search USD per call'],
                  ].map(([key, label]) => (
                    <CampaignField
                      key={key}
                      label={label}
                      help="Leave empty if unknown. All three prices are required to enforce the USD planning allowance; this is not an exact billing cap."
                    >
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        value={policy[key] ?? ''}
                        onChange={(e) =>
                          setPolicy({
                            ...policy,
                            [key]: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                      />
                    </CampaignField>
                  ))}
                </div>
              </details>
              <button className="button" disabled={busy}>
                Save usage policy
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}

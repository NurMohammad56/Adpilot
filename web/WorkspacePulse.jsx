import React from 'react';
import { ArrowRight, Compass, ClipboardCheck, BarChart3 } from 'lucide-react';
import { useLanguage } from './i18n.js';
export function WorkspacePulse({ data, setPage }) {
  const bn = useLanguage() === 'bn';
  const stages = [
    ['Products', data.products.length],
    ['Draft plans', data.plans.filter((plan) => plan.status === 'draft').length],
    ['Awaiting approval', data.approvals.filter((row) => row.status === 'pending').length],
    ['Active campaigns', data.campaigns.filter((row) => row.status === 'active').length],
  ];
  const max = Math.max(1, ...stages.map(([, count]) => count));
  return (
    <article className="panel workspace-pulse">
      <div className="panel-heading">
        <div>
          <h2>{bn ? 'আপনার marketing workspace' : 'Your marketing workspace'}</h2>
          <p>
            {bn
              ? 'Saved records অনুযায়ী বর্তমান কাজের অবস্থা; conversion funnel নয়।'
              : 'Current workload from saved records; these stages are not a conversion funnel.'}
          </p>
        </div>
        <span className="badge">
          {data.mode === 'demo' ? 'Simulated workspace' : 'Workspace records'}
        </span>
      </div>
      <div className="workspace-pipeline">
        {stages.map(([label, count], index) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
            <div className="pipeline-track">
              <i
                style={{
                  width: `${(100 * count) / max}%`,
                  background: ['#2563eb', '#0891b2', '#d97706', '#16a34a'][index],
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="workspace-next-actions">
        {[
          [Compass, 'Discover a product', 'Product discovery'],
          [ClipboardCheck, 'Review decisions', 'Approvals'],
          [BarChart3, 'Check actual results', 'Performance'],
        ].map(([Icon, label, page]) => (
          <button key={page} onClick={() => setPage(page)}>
            <Icon size={19} />
            <span>{label}</span>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
    </article>
  );
}

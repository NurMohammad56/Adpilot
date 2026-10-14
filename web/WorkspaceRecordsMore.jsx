import React from 'react';
const datasets = {
  Products: [['products', 'products', 'products']],
  'Campaign plans': [['plans', 'campaign_plans', 'plans']],
  Approvals: [['approvals', 'approval_requests', 'approvals']],
  Optimization: [['optimizations', 'optimization_recommendations', 'optimizations']],
  Performance: [
    ['campaigns', 'campaigns', 'campaigns'],
    ['manualCampaigns', 'manual_campaigns', 'manual-campaigns'],
    ['performance', 'ad_performance', 'performance'],
  ],
  'Ad control center': [
    ['campaigns', 'campaigns', 'campaigns'],
    ['manualCampaigns', 'manual_campaigns', 'manual-campaigns'],
  ],
  'Research studio': [['researchProjects', 'research_projects', 'research']],
  'Product research': [
    ['products', 'products', 'products'],
    ['researchProjects', 'research_projects', 'research'],
  ],
};
export function WorkspaceRecordsMore({ page, data, load, busy }) {
  const rows = (datasets[page] || []).filter(
    ([, collection]) => data.dataPages?.[collection]?.nextCursor,
  );
  if (!rows.length) return null;
  return (
    <section className="panel operations-jobs">
      <h3>Older workspace records</h3>
      <p>
        Recent records load first to keep the dashboard fast. Load earlier records to include them
        in the lists below.
      </p>
      {rows.map(([field, collection, kind]) => (
        <div className="operations-heading" key={field}>
          <span>
            {field}: {data[field].length} loaded / {data.dataPages[collection].total}
          </span>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => load(field, collection, kind, data.dataPages[collection].nextCursor)}
          >
            Load earlier records
          </button>
        </div>
      ))}
    </section>
  );
}

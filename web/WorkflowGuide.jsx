import React from 'react';
export function WorkflowGuide({ data, onNavigate }) {
  const connected =
    data.integration.configured && (data.mode === 'demo' || data.aiIntegration.configured);
  const researched = data.researchProjects?.some((project) => project.status === 'approved');
  const steps = [
    ['Accounts', '1. Connect accounts', connected],
    ['Products', '2. Bangladesh product costs', data.products.length > 0],
    ['Research studio', '3. Research / service markets', researched],
    ['Campaign plans', '4. Review campaign draft', data.plans.length > 0],
    [
      'Approvals',
      '5. Approve launch',
      data.approvals.some(
        (approval) => approval.status === 'approved' || approval.status === 'executed',
      ),
    ],
    ['Performance', '6. Review results', data.performance.length > 0],
  ];
  return (
    <div className="panel stepper">
      <strong>Workspace journey · {data.business.name}</strong>
      <span>
        For Bangladesh products, begin with actual costs. For international services, begin with
        country research. Both flows require a reviewed campaign and separate launch approval.
      </span>
      {steps.map(([page, label, completed]) => (
        <button key={page} className={completed ? 'active' : ''} onClick={() => onNavigate(page)}>
          {completed ? '✓ ' : ''}
          {label}
        </button>
      ))}
    </div>
  );
}

import React from 'react';
import { CircleHelp, CheckCircle2, Clock3 } from 'lucide-react';
import { useLanguage, translateText } from './i18n.js';
const remarks = {
  draft: [
    'Draft',
    'Review the findings and missing evidence, edit if needed, then request a human review.',
  ],
  pending: ['Awaiting review', 'A human reviewer must approve or reject this decision.'],
  pending_approval: [
    'Awaiting approval',
    'Review the budget, targeting and creative before approving.',
  ],
  approved: [
    'Approved',
    'The decision is approved. Campaign launch still needs its own reviewed plan and approval.',
  ],
  active: [
    'Active',
    'Synchronize performance and record actual customer outcomes before changing the campaign.',
  ],
  paused: ['Paused', 'The campaign is paused. Review results before requesting a resume.'],
  completed: ['Completed', 'The result is saved and ready to review.'],
  executed: ['Executed', 'The approved action was executed. Verify its status and actual results.'],
  needs_research: [
    'New research needed',
    'Evidence changed. Research again and request a fresh review before launch.',
  ],
  failed: ['Needs attention', 'Read the error details and correct the cause before retrying.'],
  rejected: [
    'Revise and review',
    'Revise the decision or plan using the reviewer’s remarks, then submit again.',
  ],
  queued: ['Queued', 'Your request is saved and waiting for the worker.'],
  running: [
    'Research in progress',
    'Keep working elsewhere; the result will be saved when complete.',
  ],
  superseded: [
    'Earlier version',
    'Keep this as history. Use the latest version for a new decision.',
  ],
  needs_reconciliation: [
    'Verify external status',
    'Check the remote outcome before retrying to avoid a duplicate action.',
  ],
};
export function StatusRemark({ value, compact = false }) {
  useLanguage();
  const [label, remark] = remarks[value] || [
    String(value || 'draft').replaceAll('_', ' '),
    'Review this record’s details and available next actions.',
  ];
  if (compact) return <span title={translateText(remark)}>{label}</span>;
  const Icon = ['approved', 'completed', 'executed'].includes(value)
    ? CheckCircle2
    : ['pending', 'running', 'queued'].includes(value)
      ? Clock3
      : CircleHelp;
  return (
    <div className="status-remark" role="status">
      <Icon size={19} />
      <div>
        <strong>{label}</strong>
        <p>{remark}</p>
      </div>
    </div>
  );
}

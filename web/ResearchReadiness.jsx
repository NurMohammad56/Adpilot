import React from 'react';
import { useLanguage } from './i18n.js';
export function ResearchReadiness({ report, onQuestion, onOpenLibrary }) {
  const bn = useLanguage() === 'bn';
  const retrieved =
    report.retrieval?.citedSourceCount ??
    (report.retrieval?.sources || []).filter((item) => item.cited).length;
  const competitors = report.competitorCandidates?.length || 0;
  const ads = report.adLibraryObservations?.length || 0;
  const verified = report.findings.filter(
    (item) => item.classification === 'observed' && item.quality === 'Verified data',
  ).length;
  const checks = [
    [bn ? 'Cited sources' : 'Cited sources', retrieved],
    [bn ? 'Comparable competitors' : 'Comparable competitors', competitors],
    [bn ? 'Selected ad examples' : 'Selected ad examples', ads],
    [bn ? 'Owner-verified findings' : 'Owner-verified findings', verified],
  ];
  const questions = [
    [
      'Compare real competitors',
      'Find direct comparable competitors for this exact offer and each candidate country/region. Cite current prices, buyer segments, delivery terms, dates and differences. Do not substitute generic industry growth for buyer demand.',
    ],
    [
      'Investigate buyer demand',
      'Investigate actual buyer problems, willingness to pay and objections for this offer. Find evidence against the recommendation. Specify low-cost interviews or qualified-lead checks and what results would change the decision.',
    ],
    [
      'Improve the small-budget test',
      'Compare the candidate markets and propose a single focused, capped test suitable for a small advertising budget. Include one buyer segment, one offer, measurable outcomes, stop criteria and missing facts. Do not invent CPA, sales or minimum spend.',
    ],
  ];
  return (
    <section className="panel research-readiness">
      <div className="tools-row">
        <h2>{bn ? 'Decision-এর evidence readiness' : 'Evidence readiness for your decision'}</h2>
        <span className="badge">{bn ? 'Sales guarantee নয়' : 'Not a sales forecast'}</span>
      </div>
      <div className="readiness-metrics">
        {checks.map(([label, count]) => (
          <div key={label}>
            <strong>{count}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p>
        {bn
          ? 'Search evidence, buyer validation ও profitable campaign তিনটি আলাদা বিষয়। নিচের প্রশ্ন দিয়ে missing evidence সংগ্রহ করুন; actual source যাচাই ও buyer results যোগ করলে সিদ্ধান্তের ভিত্তি শক্ত হবে।'
          : 'Search coverage, buyer validation and profitable campaigns are different. Use these questions to investigate gaps; checked sources and actual buyer outcomes strengthen the decision.'}
      </p>
      <div className="research-next-actions">
        {questions.map(([label, question]) => (
          <button className="button secondary" key={label} onClick={() => onQuestion(question)}>
            {label}
          </button>
        ))}
        <button className="button secondary" onClick={onOpenLibrary}>
          Collect competitor ads
        </button>
      </div>
    </section>
  );
}

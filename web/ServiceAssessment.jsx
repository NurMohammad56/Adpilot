import React from 'react';
export function ServiceAssessment({ report }) {
  const value = report?.serviceAssessment;
  if (!value) return null;
  const verdict = {
    test: 'Consider a capped validation test',
    revise: 'Revise the offer before advertising',
    hold: 'Collect evidence before spending',
  }[value.decision];
  return (
    <section className="panel tools-panel service-assessment">
      <span className="eyebrow">SINGLE-COUNTRY SERVICE DECISION</span>
      <h2>{verdict}</h2>
      <p>{value.rationale}</p>
      <p className="notice">
        This is a research recommendation, not a guarantee or campaign approval.
      </p>
      <div className="service-assessment-grid">
        {[
          ['Offer positioning', value.offerPositioning],
          ['Ideal buyer', value.idealBuyer],
          ['Buying and decision process', value.buyingProcess],
          ['Acquisition approach', value.acquisitionApproach],
          ['Offer tests', value.offerTests],
          ['Validation steps', value.validationSteps],
          ['When to stop', value.stopCriteria],
          ['Evidence still needed', value.evidenceGaps],
        ].map(([label, content]) => (
          <article key={label}>
            <h3>{label}</h3>
            {Array.isArray(content) ? (
              <ul>
                {content.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>{content}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

import React from 'react';
import { useLanguage } from './i18n.js';

export function ConfidenceNotes({ report }) {
  const bn = useLanguage() === 'bn',
    d = report?.confidenceDetails;
  return (
    <details className="guide-step confidence-notes">
      <summary>
        {bn
          ? 'Confidence কী বোঝায়? কীভাবে বাড়বে?'
          : 'What does confidence mean? How does it improve?'}
      </summary>
      <p>
        {bn
          ? 'Confidence মানে তথ্যের ভিত্তি কতটা শক্ত-ad সফল হওয়ার শতাংশ নয়। ছবি বোঝার confidence, market demand ও profitable ad performance আলাদা বিষয়।'
          : 'Confidence describes the strength of the evidence, not the chance that an ad will succeed. Understanding an image, market demand and profitable advertising are separate questions.'}
      </p>
      <dl className="detail-list">
        <div>
          <dt>{bn ? 'Market evidence' : 'Market evidence'}</dt>
          <dd>{d?.level || report?.confidence || 'Low'}</dd>
        </div>
        <div>
          <dt>{bn ? 'যাচাই করা স্বাধীন source' : 'Owner-checked independent sources'}</dt>
          <dd>{d?.independentSourceCount || 0}</dd>
        </div>
        <div>
          <dt>{bn ? 'Search-এ পাওয়া source' : 'Retrieved sources'}</dt>
          <dd>{d?.retrievedSourceCount || report?.retrieval?.sourceCount || 0}</dd>
        </div>
        {report?.retrieval?.citedSourceCount != null && (
          <div>
            <dt>
              {bn
                ? 'Report-এ cited source / স্বাধীন domain'
                : 'Cited sources / independent domains'}
            </dt>
            <dd>
              {report.retrieval.citedSourceCount} / {report.retrieval.independentSourceCount}
            </dd>
          </div>
        )}
        <div>
          <dt>{bn ? 'ছবির actual analysis' : 'Actual image analysis'}</dt>
          <dd>
            {d?.imagesAnalyzed || report?.visualAnalysis || report?.visualAnalyses?.length
              ? bn
                ? 'হয়েছে-specification যাচাই নয়'
                : 'Completed - specifications still need checking'
              : bn
                ? 'এখনো হয়নি'
                : 'Not available'}
          </dd>
        </div>
        <div>
          <dt>{bn ? 'Confirmed sale history' : 'Confirmed sales history'}</dt>
          <dd>{d?.confirmedSales || 0}</dd>
        </div>
      </dl>
      {report?.competitorCandidates?.length > 0 && (
        <section>
          <h4>
            {bn
              ? 'Search-এ পাওয়া competitor — যাচাই বাকি'
              : 'Discovered competitors — review required'}
          </h4>
          <p>
            {bn
              ? 'এগুলো original source দেখে যাচাই করুন। এই দাম দিয়ে স্বয়ংক্রিয় profit বা selling price বদলানো হয় না।'
              : 'Check each original source and whether the offer is comparable. These prices do not automatically change your selling price or profit calculations.'}
          </p>
          {report.competitorCandidates.map((item, i) => (
            <article className="guide-step" key={`${item.source}:${i}`}>
              <h4>
                <a href={item.source} target="_blank" rel="noopener noreferrer">
                  {item.name}
                </a>
              </h4>
              <p>{item.offer}</p>
              <p>
                {item.price != null && item.currency
                  ? `${item.price} ${item.currency}`
                  : bn
                    ? 'দাম নিশ্চিত পাওয়া যায়নি'
                    : 'Price not established'}
                {item.priceBasis ? ` — ${item.priceBasis}` : ''}
              </p>
              <p>{item.comparability}</p>
              <p>{item.deliveryTerms}</p>
            </article>
          ))}
        </section>
      )}
      {report?.evidenceGaps?.length > 0 && (
        <section>
          <h4>{bn ? 'কোন তথ্য এখনো কম?' : 'Which evidence is still missing?'}</h4>
          <ul>
            {report.evidenceGaps.map((gap, i) => (
              <li key={i}>{gap}</li>
            ))}
          </ul>
        </section>
      )}
      {report?.retrieval?.sources?.length > 0 && (
        <details>
          <summary>
            {bn ? 'Research-এর original source দেখুন' : 'View original research sources'}
          </summary>
          <p>
            {bn
              ? 'Cited source report-এ উল্লেখ হয়েছে। অন্য link search-এ পাওয়া discovery lead; সব দাবি যাচাই হয়েছে এমন নয়।'
              : 'Cited sources appear in the report. Other consulted links are discovery leads; retrieval does not verify every claim.'}
          </p>
          <ul>
            {report.retrieval.sources.map((item) => (
              <li key={item.source}>
                <a href={item.source} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
                {item.cited ? ' · Cited' : ' · Discovery lead'}
              </li>
            ))}
          </ul>
        </details>
      )}
      <ul>
        <li>
          {bn
            ? 'Low: তথ্য সীমিত, AI hypothesis বেশি। ছোট test ও source যাচাই প্রয়োজন।'
            : 'Low: limited checked evidence; treat the recommendation as a test hypothesis.'}
        </li>
        <li>
          {bn
            ? 'Medium: অন্তত ২টি স্বাধীন, সাম্প্রতিক source মালিক যাচাই করেছেন; conversion এখনো নিশ্চিত নয়।'
            : 'Medium: at least two independent, recent sources were checked by the owner; profitable acquisition still needs measurement.'}
        </li>
        <li>
          {bn
            ? 'High: অন্তত ৩টি স্বাধীন recent source এবং ২০টি recorded confirmed sale। এটি system-এর নিয়ম, statistical proof বা guarantee নয়।'
            : 'High: at least three independent recent sources and 20 recorded confirmed sales. This is a system rule, not statistical proof or a guarantee.'}
        </li>
      </ul>
      <p>
        {bn
          ? 'Evidence ও competitor section-এ original URL ও তারিখ দিন। তারপর actual delivered order, refund, cost এবং ad spend রেকর্ড করুন। শুধু দাম বাড়ানো, ছবি যোগ করা বা শক্তিশালী model ব্যবহার করলে confidence High হবে না।'
          : 'Add original dated sources and comparable competitor offers, then record delivered orders, refunds, costs and ad spend. A higher price, more pictures or a stronger model does not automatically create High confidence.'}
      </p>
      {report?.visualAnalysis && (
        <>
          <h4>{bn ? 'Product-এর ছবি থেকে পর্যবেক্ষণ' : 'Product image observations'}</h4>
          <ul>
            {report.visualAnalysis.report.observations.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p>{report.visualAnalysis.report.uncertainClaims.join(' ')}</p>
        </>
      )}
      {report?.visualAnalyses?.map((v) => (
        <div key={v.productId}>
          <h4>{v.name}</h4>
          <ul>
            {v.report.observations.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
          <p>{v.report.uncertainClaims.join(' ')}</p>
        </div>
      ))}
    </details>
  );
}

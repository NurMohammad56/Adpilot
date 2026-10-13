import React from 'react';
import { Compass, FlaskConical } from 'lucide-react';
import { useLanguage } from './i18n.js';
import { ProductDiscovery } from './ProductDiscovery.jsx';
import { ResearchDesk } from './WorkspaceTools.jsx';
import './product-research-hub.css';

export function ProductResearchHub({ tab, setTab, ...props }) {
  const bn = useLanguage() === 'bn';
  const tabs = [
    [
      'discover',
      Compass,
      bn ? 'নতুন idea খুঁজুন' : 'Discover ideas',
      bn
        ? 'Trend, competitor ও সম্ভাব্য product shortlist'
        : 'Trends, competitors and product shortlists',
    ],
    [
      'research',
      FlaskConical,
      bn ? 'Product যাচাই করুন' : 'Research a product',
      bn
        ? 'নির্দিষ্ট product-এর বাজার, buyer ও campaign decision'
        : 'A product’s market, buyers and campaign decision',
    ],
  ];
  return (
    <>
      <div
        className="product-hub-tabs"
        role="tablist"
        aria-label={bn ? 'Product research workflow' : 'Product research workflow'}
      >
        {tabs.map(([key, Icon, label, remark], index) => (
          <button
            type="button"
            role="tab"
            key={key}
            id={`product-tab-${key}`}
            tabIndex={tab === key ? 0 : -1}
            aria-selected={tab === key}
            aria-controls={`product-panel-${key}`}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                const next =
                  tabs[
                    event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? tabs.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
                  ][0];
                setTab(next);
                document.getElementById(`product-tab-${next}`)?.focus();
              }
            }}
          >
            <Icon size={20} />
            <span>
              <strong>{label}</strong>
              <small>{remark}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="product-hub-remark">
        {bn
          ? 'একটি section-এ idea → market research → actual product → approved campaign। Products-এ আপনার actual দাম, খরচ ও stock থাকবে; এখানে research ও decision হবে।'
          : 'One section for ideas → market research → an actual product → approved campaign. Products keeps your actual prices, costs and inventory; research and decisions happen here.'}
      </p>
      <section role="tabpanel" id={`product-panel-${tab}`} aria-labelledby={`product-tab-${tab}`}>
        {tab === 'discover' ? (
          <ProductDiscovery
            {...props}
            setPage={(page) => {
              if (page === 'Product research') setTab('research');
              props.setPage(page);
            }}
          />
        ) : (
          <>
            <div className="product-research-purpose">
              <strong>
                {bn
                  ? 'Ad Library থেকে ব্যবসার সিদ্ধান্ত পর্যন্ত'
                  : 'From competitor evidence to a business decision'}
              </strong>
              <p>
                {bn
                  ? 'Ad Library research-এ প্রতিযোগীর বিজ্ঞাপনের hook, offer ও creative বোঝা হয়। এখানে সেই saved evidence-এর সঙ্গে আপনার প্রোডাক্টের দাম, খরচ, buyer need ও delivery risk মিলিয়ে ব্যবসা ও ছোট test-এর সিদ্ধান্ত নেওয়া হয়।'
                  : 'Ad Library research explains competitors’ hooks, offers and creatives. Product research combines that saved evidence with your prices, costs, buyer needs and delivery risks to decide what to validate before a small sales test.'}
              </p>
              <ol>
                <li>
                  {bn
                    ? 'Saved product-এর বাস্তব তথ্য ব্যবহার করুন'
                    : 'Reuse your saved product facts'}
                </li>
                <li>
                  {bn ? 'Saved competitor evidence যুক্ত করুন' : 'Use saved competitor evidence'}
                </li>
                <li>
                  {bn
                    ? 'ব্যবসার সিদ্ধান্ত যাচাই ও approve করুন'
                    : 'Review and approve the business decision'}
                </li>
              </ol>
              <small>
                {bn
                  ? 'একই ad-এর analysis আবার দিতে হবে না। নতুন প্রশ্ন বা নতুন evidence-এ research বদলাবে; অপরিবর্তিত analysis cache থেকে reuse হয়।'
                  : 'No need to enter or analyze the same ad again. New questions or evidence change the research; unchanged analysis is reused from cache.'}
              </small>
            </div>
            <ResearchDesk {...props} mode="product" onOpenDiscovery={() => setTab('discover')} />
          </>
        )}
      </section>
    </>
  );
}

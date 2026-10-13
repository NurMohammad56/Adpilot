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
          <ResearchDesk {...props} mode="product" onOpenDiscovery={() => setTab('discover')} />
        )}
      </section>
    </>
  );
}

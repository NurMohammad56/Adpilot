# Product discovery and workspace dashboard

Product discovery investigates potential products **before** creating inventory. It uses the saved workspace research model/thinking level with native search when enabled. Reports are hypotheses with traceable source references, not promised demand or profit.

## Workflow

1. Open **Product discovery**, choose a market and sector, and describe constraints or a keyword. Bangladesh and all major retail sectors are defaults.
2. Review the source hub: Meta Ad Library, Google Trends Explore/Trending Now, TikTok Creative Center/Top Ads, and Daraz for Bangladesh. Country/keyword links are prepared where supported. TikTok requires its own available regional filters.
3. Optionally load Google's public RSS feed. These are actual dated search surges, including news; they are never labelled product sales or promotion rankings. The fixed Google endpoint is bounded to 8 seconds/512 KB, redirects rejected, and cached for 30 minutes. Outages return explicit unavailable status with no invented measurements.
4. Expand saved ads/source observations. Select relevant saved ads and enter actual source facts, date and URL. General inspiration is opt-in. URLs alone do not establish product demand.
5. Run research. Live requests use a durable Redis job with one attempt, workspace authorization, pending-request deduplication and saved-result recovery. Identical inputs, model, language and selected ad evidence reuse a report for up to 12 hours within the same UTC date; no scheduled paid discovery is added.
6. Inspect product hypotheses, trend observations, comparable offers/quoted prices, missing evidence, sourcing checks, risks and small-budget validation steps. Unknown competitors/prices remain unknown. Candidate URLs not actually cited by retrieval or supplied as source observations are discarded.
7. Bookmark a shortlist. Use **Check competitor ads** to open Ad Library with the candidate keyword/country; save actual copy/screenshots and analyze through the existing ad analyzer.
8. **Research this idea** opens **Product research** and creates one idempotent draft brief, carries selected ads and source observations, and keeps the discovery report/candidate IDs. Product research sees the historical discovery context and rechecks current sources. New research and campaign approvals remain separate.
9. **Add actual product** starts a separate saved draft with name/category/selected ads. Description, inventory, selling price, verified specifications and supplier costs must come from the user's real product. No fabricated product or inventory is inserted automatically.

The scenario calculator uses the same product cost engine as Product Studio, with inside-Dhaka BDT 80 and outside-Dhaka BDT 120 presets. Failed-order rate and profit reserve are explicitly editable assumptions. Profit calculations require entered prices/costs and do not predict ad CPA, leads or sales; full fees/taxes belong in the actual product profile.

## Evidence and confidence

Ad sector bars count saved observations, with keyword-inferred categories and historical observed active status. They are **sample coverage**, not Meta-wide market share or most-promoted products. Free Ad Library does not provide a complete commercial-ad spend/ROI ranking. Public source integrations do not silently scrape restricted sites or assert access to private competitor analytics.

Research Studio adds visible counts for cited sources, comparable competitors, selected ads and owner-verified findings, plus ready-made follow-up questions. These improve evidence collection; confidence is not artificially raised by prompting. Owner-verified buyer evidence and actual outcomes remain necessary for stronger demand/profit conclusions.

The ERP-style dashboard shows current saved-record workloads and existing campaign-performance graphs. Workload bars are not a conversion funnel. Empty live performance stays empty; demo figures are explicitly simulated. Product discovery reports support the existing cached Bangla display translation without modifying numeric facts, URLs, source reports or approvals.

## API and data

- `GET /api/discovery?country=BD`: owned report summaries, jobs, current sampled sector coverage.
- `GET /api/discovery/trends?country=BD&keyword=...`: bounded public trend feed and source shortcuts.
- `POST /api/discovery`: validate inputs; return cached report or queued job.
- `GET /api/discovery/:id`: owned immutable report and mutable shortlist.
- `POST /api/discovery/:id/shortlist`: `{candidateId, selected}`; workspace-locked update.
- `POST /api/discovery/:id/brief`: `{candidateId}`; idempotent draft handoff, current selected-ad check.
- `POST /api/report-translations`: adds `kind: "discovery"` to the existing owned translation endpoint.

New collection: `product_discoveries`. Historical reports remain intact. Queue records expose status and result ID without input hashes/request hashes/user identifiers. The public Google feed is the only new direct outbound fetch; fixed host/validated country prevents arbitrary URL fetching. Discovery never creates or activates Meta campaigns.

Primary source references: [Google Trends usage](https://developers.google.com/search/docs/monitor-debug/trends-start), [Trending Now help](https://support.google.com/trends/answer/3076011), [TikTok Top Ads](https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en), [Meta Ad Library](https://www.facebook.com/ads/library/).

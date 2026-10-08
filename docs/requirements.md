# Phase 1 acceptance mapping

| Source requirement                     | Implementation / evidence                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Business and product profiles          | Registration, settings, product create/edit UI; authenticated tenant-scoped API                                                               |
| Actual costs and product economics     | Versioned cost history, fees, expected returns, sustainable CPA/ROAS; deterministic engine tests                                              |
| Bangladesh market research             | Structured report, named local events, source/time/confidence/quality labels, manual evidence, optional research gateway                      |
| Competitor intelligence                | Sourced competitor name/product/price/offer/positioning/strength/weakness records feeding pricing and report; no fabricated competitor prices |
| Market scores                          | Stored weighted scoring contract; unknown components leave the score unset; reproducibility tests                                             |
| Pricing recommendation and override    | Minimum viable, competitive if sourced, recommended, premium and test prices; UI revision; viability gate                                     |
| Test budget                            | Duration, daily/total ceilings, one primary ad set, creative tests, data requirements and decision point                                      |
| Audience and locations                 | Business delivery footprint, broad adults, primary/secondary/experimental/retargeting profiles; Meta location resolution                      |
| Strategy and copy                      | Purchase goal, placements, allocation, Bangla/English copy, hooks/headlines/CTA, image/UGC concepts, versioned creatives                      |
| Risk validation                        | Explainable warnings, assumptions and invalid-plan errors; live prerequisites checked separately                                              |
| Approve / reject / edit                | Exact snapshot and action hashes, new plan versions, audit decisions, role checks, 24-hour expiry                                             |
| Execute through MCP                    | Real SDK stdio client/server; real protocol integration test; compound Meta creation adapter                                                  |
| Campaign budget/pause/resume approvals | Explicit proposed actions with payload integrity and campaign-state binding; no unattended action worker                                      |
| Targeting / creative experiments       | Labeled in-place targeting and individual creative replacement requests, exact-payload approval, persisted creative versions and checkpoints  |
| Meta performance                       | Paginated live campaign/ad-set/ad insights; persisted daily upserts; demo fixtures clearly labeled                                            |
| Analytics                              | Spend, impressions, reach, clicks, CTR/CPC/CPM, purchases, CPA, nullable revenue/ROAS, CVR, daily frequency; range reach caveat               |
| Optimization                           | Pause review for no-purchase spend, sustained poor CPA, deterioration; 15% profitable scaling proposal; human approval                        |
| Jobs                                   | BullMQ insights/analysis/research/report/maintenance jobs and backoff for reads                                                               |
| Security                               | Encrypted tokens, server-only credentials, RBAC, tenant isolation, session expiry, same-origin checks, audit trail                            |
| Duplicate and partial failure handling | Unique approved launch, transactional reservations, object checkpoints, reconciliation state, no write retry                                  |
| Budget bypass prevention               | Product and business checks at plan, approval and execution; real Mongo concurrency and rollback test                                         |

## External acceptance required before real advertising

Live Meta permission/account tests, token lifecycle, current API compatibility, valid geo keys, actual creative policy compliance, purchase tracking quality and account spend limits require the operator's connected credentials. The user selected demo adapters, so no real campaign or paid account mutation was attempted.

Mongo transaction behavior is exercised with a real ephemeral replica set. A real Redis/BullMQ read-job retry and deduplication test also passed using the preinstalled local Redis 5.0.14.1. This older Redis is only a local test convenience: live deployments require Redis 6.2+; compose/CI target Redis 7.4. Docker Desktop is installed but its daemon was unavailable during initial environment inspection; the demo is independent of Docker.

The document's sections 29–32 and 38 originally reserve global/SaaS/other-platform features for later phases. The user's later explicit request expands the implemented scope to independent client account contexts, media upload and iterative international product/service/software research, plus approved service/software website lead/purchase drafts. See [the expansion's user guide and limits](workspaces-media-research.md). Subscription lifetime-value economics and other ad platforms remain outside scope. Email workflows/MFA, external immutable audit retention, generic arbitrary Meta mutation tools, independent live crawling, dynamic statistical allocation and confirmed order ingestion are not represented as completed capabilities.

## Subsequent user-request acceptance

| Request                                  | Implementation and verification                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Own account/Page/pixel/AI keys           | Accounts interface, verified encrypted integrations per workspace; new live contexts cannot inherit the initial provider key                    |
| Multiple independent client contexts     | Workspace creation/membership/switching; server ownership and stale-tab header checks; Mongo and browser isolation tests                        |
| Upload images and videos                 | Real multipart JPEG/PNG/WebP/MP4/WebM upload, private ranges, size/quota/type validation; actual browser video upload                           |
| Proper hosted storage path               | Local persistent storage and private S3-compatible driver; signed S3 wire test and real private R2 authenticated upload/read/range/privacy verification passed                               |
| Compare product/service/software markets | Country research workbench, up to 10 of 35 candidate countries, dated evidence and qualitative source-aware comparisons                         |
| Discuss, edit and research repeatedly    | Follow-up instructions, versioned brief/report snapshots, country/decision edits and immutable previous reports                                 |
| Approve final research decision          | Role-gated current-version decisions; edit/research invalidation; no campaign write on research approval                                        |
| Automatic campaign/ad creation           | Approved service draft uses existing campaign/ad-set/creative/ad MCP graph; separate launch approval and paid execution flag                    |
| Custom ecommerce development campaign    | Service offer, selected country, website lead/purchase objective, uploaded media, currency-aware cost/budget inputs; full demo browser workflow |

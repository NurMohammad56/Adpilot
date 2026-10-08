# AdPilot - Ads Research and Campaign Studio

A runnable implementation of the [AI-powered Facebook Ads automation specification](https://docs.google.com/document/d/18HsdTKCjJGfLG7BP48qrWCDZM0YqVncgQ4HWlsAnZXc/edit), extended by the user's subsequent request for separate client workspaces, private image/video uploads, iterative international research, and service/software campaigns. Physical-product economics retain the Bangladesh workflow. Service/software plans use the approved test country and a website lead or purchase goal. Advertising changes require human approval.

The default demo works locally without Meta credentials, an LLM key, MongoDB, or Redis. It exercises the same recommendation, validation, approval, audit, and MCP paths as the live application. Demo observations, seeded approvals, advertising objects, and performance are explicitly simulated.

## Run

Requires Node.js 22.12+ and npm.

```powershell
npm ci
npm run dev
```

Open **http://localhost:5173**, then select **Explore demo workspace**. The API listens on `127.0.0.1:4000`. Demo data persists in `.data/demo.json`; run only one API process against that file.

For a single server serving the built UI:

```powershell
npm run build
npm start
```

Open **http://localhost:4000**. Demo login: `demo@adpilot.local` / `DemoAccess2026!`. The demo login endpoint is unavailable in live mode and the server refuses to run demo mode with `NODE_ENV=production`.

## What you can do

1. Register a business workspace or explore the seeded demo.
2. Configure business delivery coverage and aggregate budget ceilings.
3. Add/edit products, inventory, actual costs, payment fees, expected COD/return losses, price, and required profit.
4. Add dated, sourced market observations and competitor prices/offers.
5. Generate a structured Bangladesh research report, economics, audience/location recommendation, test budget, campaign strategy, and Bangla/English creative hypotheses.
6. Review all economics, evidence labels, assumptions, risks, and validation results. Revise price, budget, duration, regions, age range, and creative copy in a new immutable plan version.
7. Submit a plan. An administrator/approver can reject, edit/revalidate, or approve and execute through MCP.
8. Synchronize campaign/ad-set/ad insights, inspect historical metrics, and generate purchase-based optimization recommendations.
9. Request human approval for pause, resume, budget, targeting, or creative changes. Total spend caps remain unchanged during budget changes.
10. Review the audit trail and manage analyst/approver team members.
11. Use **Accounts** to create/switch separate client workspaces and configure each one's Meta account, Page, pixel, access token/app secret, and Gemini API key/model. New live workspaces do not inherit another client's credentials.
12. Use **Media library** to upload private JPEG/PNG/WebP images (10 MB) and MP4/WebM videos (50 MB), then select them and an image cover for videos in campaign drafts.
13. Use **Research** for physical products, services or software: compare up to 10 countries from a 35-country catalog, supply dated evidence, ask follow-up questions, edit decisions, preserve history and approve the current research version.
14. Turn approved service/software research into a capped campaign draft; review copy/media/economics and request a separate launch approval. Unknown acquisition economics require an explicitly acknowledged discovery test.
15. Switch dashboard language with **????? / English**, use guided categories/payment/delivery and research examples, preserve browser-tab drafts, and turn approved linked Bangladesh product research into a sales campaign. See [the usability and R2 guide](docs/usability-and-storage.md).

The compound launch creates a campaign, ad set, creative versions and ads while paused, checkpoints every returned remote ID, and activates only the approved plan. Targeting and creative changes use labeled, single-variable experiment requests with exact human-approved payloads. Replacement creatives preserve history and remote upload checkpoints; arbitrary Meta writes are not exposed to the LLM. Detailed acceptance mapping is in [docs/requirements.md](docs/requirements.md).

## Engineering choices

- **Backend:** Node.js, Express 5, JavaScript ES modules, schema-validated endpoints.
- **Persistence:** Mongoose/MongoDB transactions in live mode; transactional JSON development adapter in demo mode.
- **Jobs:** Redis/BullMQ workers in live mode; synchronous demo insights.
- **AI:** native Gemini and provider-agnostic HTTPS gateway, with strict structured-output validation; deterministic demo research/copy adapter.
- **Actions:** actual MCP SDK stdio client/server; approval IDs are the only mutation inputs.
- **Frontend:** React/Vite, responsive desktop/mobile dashboard, bundled fonts including Bangla.
- **Files:** private authenticated streams; local persistent storage or an S3-compatible adapter, workspace ownership and immutable approval-bound checksums.
- **Security:** scrypt password hashing, hashed expiring sessions, HTTP-only SameSite cookies, same-origin mutation checks, RBAC, tenant scoping, AES-256-GCM Meta token encryption, audit records, approval/payload fingerprints and transactional budget reservations.

See [the workspace/media/research guide](docs/workspaces-media-research.md), [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md), and [docs/live-setup.md](docs/live-setup.md).

## Verification

```powershell
npm run verify
npx playwright install chromium
npm run test:e2e
```

`npm test` covers economics, unknown revenue, conversion-based optimization, RBAC, workspace isolation and stale browser tabs, research history/concurrency, approval expiry/tampering, stale plans, duplicate execution, concurrent budgets, partial failures, private upload signatures/range reads, signed S3 wire operations, image/video Meta adapter requests, insight upserts, HTTP security, actual MCP execution, and real Mongo replica-set transactions. The first Mongo test run downloads an ephemeral MongoDB binary; it never connects to a production database. Browser tests use separate demo data/files and exercise product and service workflows. CI is included in `.github/workflows/ci.yml`.

Redis integration has an opt-in test (`npm run test:redis`) against a real configured Redis instance. Docker infrastructure commands need Docker Desktop running; the demo does not.

## Live activation and limits

Live MongoDB transactions, Meta account/Page/pixel reads, encrypted token storage, Gemini structured research/copy, and browser administrator login have been checked locally. Paid Meta campaign acceptance has not been performed. Keep `LIVE_EXECUTION_ENABLED=false` until the runbook is completed with a small controlled test.

The configured local workspace runs in live planning mode at **http://localhost:4000**. Initial administrator credentials are in the private, Git-ignored `.data/initial-admin.txt`. Background jobs are explicitly disabled until `REDIS_URL` contains a valid TCP/TLS connection string. REST credentials authenticate Upstash's HTTP interface and cannot run BullMQ. Production and paid execution refuse to start with background jobs disabled. A hosting provider/domain is still needed for public deployment.

- The application enforces the **configured daily budget**, aggregate budget reservations, product test ceilings, campaign total spend cap, and approval payload. Meta's daily budget is a delivery setting and is not a guaranteed exact daily charge. Use the campaign/account spend limits and verify current Meta delivery behavior before treating any nominal daily budget as an actual hard daily spending limit.
- Use a dedicated ad account or account-level reconciliation: the app cannot constrain campaigns created outside its own workflow.
- Research without dated observations stays labeled as assumptions. Optional Gemini Google Search grounding retrieves links for review; the supplied account currently rejects search requests with quota errors, so grounding is disabled locally. Competitor prices and regional scores stay unknown when evidence is missing. No built-in live web crawler is supplied.
- Meta purchase value is attributed revenue, not confirmed delivered/COD revenue. Website leads do not imply revenue or qualified sales. Actual order-status ingestion, Conversions API, subscription LTV/churn economics, and other advertising platforms remain future work. International service/software plans now exist; account/country-specific paid acceptance remains untested.
- Private Cloudflare R2 storage is configured and active locally. Authenticated upload/download/range reads and anonymous rejection passed against the real bucket. Files remain private behind the workspace API. API and worker must use the same bucket; production rejects unconfirmed ephemeral local storage.
- Service plans currently use adult country targeting and website pixel events. Instant lead forms, WhatsApp goals, regulated advertising categories, and additional country-specific disclosures are not implemented; complete the applicable Meta account/market checks before paid acceptance.
- The API offers approval-gated compound launches and pause/resume/budget/targeting/creative actions. Standalone arbitrary ad/ad-set creation/deletion is not exposed; initial creation is part of the exact approved campaign plan.
- Password reset/email verification, MFA, organization SSO, immutable external audit storage, and shared multi-instance HTTP rate limiting are deployment hardening tasks; this release supplies local/password RBAC and append-only application audit endpoints.

No real campaign is launched by installing, starting, testing, or browsing the demo.

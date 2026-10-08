# Verification record

Validated on 8 October 2026: local Node 22.17.0; Ubuntu 24.04 VPS with Node 22.23.3 in Docker. Production login and campaign review now pass. Full Gemini 3.8 research acceptance remains blocked by provider availability.

| Check | Result |
| --- | --- |
| JavaScript checks, production build | Previously passed; application source was unchanged during this live verification |
| Backend economics/API/security/MCP/provider tests | 64 previously passed, including model-preserving overload retries, immediate daily-quota failure, response repair, provenance and subpath cookies/media |
| Browser regression suite | Seven previously passed scenarios |
| Atlas from VPS | All three replica-set hosts connected over verified TLS 1.3 after the VPS IP was allowed |
| Public API and login | HTTPS health, real administrator sign-in, secure subpath session cookie and workspace overview passed |
| Live browser | Real sign-in, Accounts, Media library and Research studio rendered; saved test report rendered on desktop and mobile without JavaScript errors or horizontal overflow |
| Redis and worker | API/Redis healthy; one registered BullMQ worker and hourly/daily schedulers verified; zero failed jobs. Earlier private Redis deduplication/retry also passed |
| R2 through public API | Real image upload, authenticated download, byte-range response and anonymous 401 passed; test object removed |
| Workspace AI key | New local `.env` key differed from the saved encrypted workspace key. New key verified and saved through the authenticated live Accounts API |
| Gemini model settings | Research remains `gemini-3.8-flash`, High thinking; copy remains `gemini-3.1-flash-lite`. No silent model downgrade |
| Gemini native generation | New key returned HTTP 200 with valid JSON from Flash Lite. Complete saved 10-country research through the public API exhausted bounded retries with provider `UNAVAILABLE`/503. An independent small Flash High-thinking request also returned 503 and Google's high-demand message |
| Research version review | Submit and approval passed using an explicitly marked manual verification fixture, not a Gemini-generated research report |
| Campaign review | Fixture-linked service draft generated three real Flash Lite copy variants. Owned R2 media, country, BDT budget, validation, research bindings, submission, rejection, resubmission and separate approval passed |
| MCP execution gate | Public execute route reached the stdio MCP/internal service and returned 409 `APPROVAL_REQUIRED` for the rejected test approval before any Meta mutation |
| Live Meta reads | Connected ad account, Page and pixel re-verification passed |
| Paid execution | Enabled in production configuration; no advertising mutation or paid campaign was attempted. Actual paid Meta acceptance remains untested |
| Test cleanup | Only the isolated QA project, report, offer, plan, approval records and R2 image removed. Original research brief and workspace account settings preserved |

The earlier Atlas blocker is resolved. The earlier 429 came from the previously saved workspace key; updating `.env` alone does not replace an existing workspace's encrypted Accounts key. The new key was synchronized securely through the live API. Its current research failure is Google's model high-demand response, not an Atlas or login failure. More retries or a new key cannot be assumed to resolve shared model capacity.

Google Search grounding remains disabled. Unsourced research stays labeled as hypotheses. The separate Google Deep Research agent is not integrated. Campaign review tests used a manual fixture to isolate campaign behavior from the unavailable research model; they do not establish that a full AI research-to-paid-ad run works.

Research re-verification on 8 October 2026 at 12:48–12:50 UTC ran the original saved custom-ecommerce brief through the public production API with all ten countries and Gemini 3.8 Flash High thinking. The provider again returned `UNAVAILABLE`/503 after bounded retries; the application returned its explicit provider error. Verified that the original project revision, current-version pointer and report history were unchanged by failure. An independent request to the stable Google `v1` route also returned the same high-demand 503. Flash Lite still generated valid native JSON. No replacement model was selected and no synthetic report was saved as a successful research result.

Private evidence is in Git-ignored `.data`: `production-status.json`, `live-acceptance-status.json`, `new-gemini-capacity.json`, `live-research-verification.json`, `stable-route-status.json`, `live-acceptance-research.png`, and earlier provider/storage/browser records. The authenticated public research check is reproducible with `node .data/verify-research-live.js`; a successful run saves a new draft report to the original brief and checks strict validation, integrity, persistence and browser rendering. Do not publish administrator credentials or private artifacts.

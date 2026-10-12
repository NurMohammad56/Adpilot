# Free Ad Library research

AdPilot uses Meta's public Ad Library website for discovery. It opens a country/keyword or Page-ID search in a separate browser tab. No Facebook login credentials, Marketing API token, paid data provider or scraper is used by this feature. Meta controls whether a search or individual ad is visible. The official archive API has narrower coverage than the website; see [Meta's API overview](https://br-fr.facebook.com/ads/library/api/?source=onboarding).

## User workflow

1. Open **Ad Library research** from the sidebar. Choose a country and a short Bangla/English keyword or public advertiser Page ID, then open the free search.
2. In Meta, open an individual ad's details. Copy its Library ID/link and actual ad text. Capture screenshots of the relevant creative. Return to AdPilot.
3. Save the advertiser name, country filter, observed status/date and optional offer, destination and notes. Link it to a product or research brief when it should inform that offer. Save screenshots directly or select uploaded images. A link alone can be saved as a bookmark; it does not automatically fetch the ad.
4. Choose **Analyze saved ad with AI**. The saved workspace research model uses high thinking and actual screenshot bytes. Ad Library discovery is free; AI uses the connected provider's normal API usage. A video ad can be documented through screenshots of important frames; full-video analysis is not provided.
5. Review visible observations, hooks, offer comparisons, buyer hypotheses, differentiation, small-budget test ideas and evidence gaps. Start fresh product/group/brief research to include linked observations. Approved and historical reports keep their original snapshots.

## Evidence and storage

`ad_library_observations` stores workspace-scoped canonical individual-ad URLs, owner-supplied dates/status/copy, product/brief links and private media IDs. Canonicalization accepts numeric Library IDs and trusted Facebook Library/snapshot URLs, strips query credentials, and rejects lookalike hosts or search-only URLs. Source dates cannot be in the future. Status and country are the owner's observed information; they are not live-verified delivery or exact targeting.

Screenshots use the existing private R2/local storage, file-signature validation and checksum checks. Up to four images with 20 MB combined are allowed per analysis. No image base64 or AI credentials are stored in observations, jobs or audit events. Saved ads are deduplicated by workspace, Library ID and country. Editing uses an expected revision to stop stale browser writes.

Live analysis runs on the existing Redis/BullMQ worker. Pending requests with identical input/model/language snapshots deduplicate, and completed identical analyses are reused. Jobs bind the observation, linked offer, screenshot checksums and AI model; stale inputs are rejected before or after provider work. Expensive full analyses are not automatically repeated after provider retries. A late worker redelivery reuses an already saved result. Queue failures leave saved observations intact.

Product, product-group and research-brief workflows receive compact, dated linked examples and current AI conclusions. Changed examples/offers/screenshots retain their earlier report for inspection, but stale conclusions are omitted from new research. Archived ads are excluded from new research and can be restored. General inspiration remains on the board until linked. These examples never automatically enter competitor-price financial calculations or certify `Verified data`, buyer demand, spend, conversions, CPA, ROAS or profit. A long-running ad is not proof of profitability.

## Endpoints

| Method | Endpoint                      | Purpose                                                                 |
| ------ | ----------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/ad-library`             | Workspace observations, stale-analysis markers and recent analysis jobs |
| POST   | `/api/ad-library`             | Save a canonical, dated observation                                     |
| PUT    | `/api/ad-library/:id`         | Edit using `expectedRevision`                                           |
| POST   | `/api/ad-library/:id/archive` | Archive/restore using `archived` and `expectedRevision`                 |
| POST   | `/api/ad-library/:id/analyze` | Return a cached result, run demo analysis, or enqueue live analysis     |

All endpoints use the existing authenticated session, workspace membership/origin checks and operation locks. The board supports up to 300 saved observations per workspace. Research uses bounded recent linked examples to control context size and AI cost, while full notes/reports remain available on the board.

## Reusing general inspiration and renewing reviews

Product creation/editing and Research studio include a Saved competitor ads picker with summaries and optional full analysis. Explicit `adLibraryIds` select examples, including General inspiration, while directly linked ads are included automatically. Saving a general example does not change unrelated research. No ad example is silently applied to every new product; the owner chooses relevant examples. Linked products also carry their selected examples into a brief and product-group research.

Reports save an ad evidence scope and fingerprint. Adding, editing, archiving/restoring or materially changing the analysis of an included ad invalidates affected current research and unlaunched plans. Their earlier report text and approval snapshots remain unchanged for history. Research projects move to `needs_research`, and pending/approved launch approvals are superseded. Both review and launch paths verify evidence freshness, including changes during model work. Existing remote campaigns are not paused, edited or relaunched.

The Ad Library board shows affected offers and provides explicit regeneration buttons. Live regeneration runs as a deduplicated Redis job and records a fresh draft plan/version, which needs a new review and approval. It does not reuse the earlier approval or automatically spend on ads. Existing approved service research must be researched and reviewed again before creating its next campaign. Product groups are regenerated from Products. `POST /api/ad-library/refresh-research` accepts a product/research kind and its owned ID.

## Bangla report display

Switching to Bangla translates generated research reports, campaign report prose and saved ad analyses through the connected AI provider. The translation is a separate cached display; source reports, decisions, targeting identifiers, financial fields, original source URLs, published ad copy and approval hashes remain unchanged. A language switch is also available inside the campaign review modal.

`POST /api/report-translations` accepts a supported report kind/ID and `language: bn`. Only an allowlist of prose fields is translated; numeric values embedded in prose must remain literal. Missing entries, non-Bangla output or changed numeric/source literals reject the translation and preserve the original display. The original-report toggle and retry remain available. Already Bangla prose is retained, and repeated views reuse a source/model-bound translation cache. Translation uses low thinking without search; this incurs the connected provider's normal API usage rather than regenerating market research. Demo translations are explicitly marked as simulated.

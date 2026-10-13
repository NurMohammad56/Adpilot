# Product research and reusable competitor evidence

Products stores the actual offer, images, inventory, costs and selling price. **Research this product** opens or creates a linked physical-product brief; existing briefs are reused without overwriting user edits. Research approval and campaign approval remain separate. Digital Research studio continues to use service/software briefs.

Physical research has one sidebar section with **Discover ideas** and **Research a product** tabs. Discovery finds hypotheses before inventory; individual research validates a selected idea or actual product. Existing discovery reports, shortlists and physical briefs retain their IDs/history. Old Product discovery navigation is mapped to the discovery tab. Tabs support keyboard navigation, English/Bangla and mobile layout.

## Workflow

1. Add a product once, then choose **Research this product**.
2. Build the free search checklist. It includes common English/Bangla synonyms, optional owner terms and saved competitor Page searches. **Expand keywords with AI** adds suggestions; it does not claim searches were performed.
3. Open the public Meta links and inspect actual ads. **Save competitor ads** preserves the product/brief context. Existing unfinished ad content is retained rather than silently discarded.
4. Use **Quick capture** to paste copied details once. It reads explicitly labelled Library/Page IDs, advertiser, ISO start date and visible English/Bangla prices; ambiguous quotes stay selectable, ambiguous currencies/ranges are not guessed, and embedded credential parameters are removed. Confirm missing fields, the observed date, price basis and specification comparability before saving. Screenshots are optional for copy/offer analysis and useful for visual creative analysis.
5. Analyze the saved ad. A clearly visible price can be suggested by the AI with supporting text. Applying it updates the unsaved form only. The owner checks and saves it; comparability is never assigned automatically.
6. Research the market, discuss remaining questions, edit and approve the decision, then prepare the campaign. Saved evidence is included in both physical-product and digital-service reports. Evidence changes invalidate affected reports and pending approvals under the existing snapshot checks.

## Evidence and price history

Advertiser and ad counts are counts of this workspace's saved sample, never the total Facebook market. Advertiser identity prefers an actual Page ID; otherwise names are normalized. Long-running ads do not prove profitable performance. Duration is calculated only to the observed date, not presented as current delivery.

Every saved observation revision is retained in `ad_library_history`; existing legacy observations gain their original snapshot on their first edit. Aggregates exclude archived records. Prices are grouped by country, currency and basis, with one latest comparable quote per advertiser. Ranges require a linked product/brief, explicit comparable specifications and a quote under 30 days old. Bundles, unknown prices/bases and unscoped general inspiration are excluded. Physical product pricing accepts only fresh comparable Bangladesh/BDT unit quotes. These are owner observations, not independently verified willingness to pay or competitor profit.

## Research cache

`research_cache` stores schema-validated AI analysis for up to 12 hours, isolated by workspace. Keys include task, inputs, evidence/visual context, language, provider, model, thinking, grounding and a credential fingerprint. No API keys are stored in cache entries. Product changes, saved evidence changes, a new discussion question or changed model/settings lead to a new key. Fresh source check bypasses reuse. Concurrent identical requests in one process are merged; production endpoints also use operation locks. Mongo has a unique workspace/key index and TTL cleanup; demo storage and workspace cache size are bounded to 200 entries.

Cached research never caches an approval or campaign action. A new campaign draft gets a new plan ID and needs its own review. The UI states whether its analysis was reused. Old reports remain readable as historical snapshots.

## Official Meta API coverage

[Meta's Ad Library API](https://www.facebook.com/ads/library/api/) supports commercial-ad queries for the supported UK/EU markets; it does not provide general Bangladesh commercial-ad collection. The official read-only search returns up to 25 matches for one query with a truncation indicator, strips paging URLs, and never infers prices or performance. Results must be reviewed in the capture form before saving. Matching API queries are cached, with a fresh-check option. An eligible token and separate Meta Ad Library access may be required; denial preserves public search and existing reports.

No browser scraping, CAPTCHA bypass, fake ad counts, fabricated prices, ad spend estimates or profit guarantees are implemented. Search checklist review marks are browser session notes, not independently verified searches.

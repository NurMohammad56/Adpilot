# Physical product validation and ad evidence

The **Research a product** tab uses physical-product fields: a saved product or new idea, product name/category, research goal, actual features and buyer benefits, likely buyers, target markets, product questions and dated evidence. It does not show a service/project name or a disabled one-option Offer type. Digital Research studio retains its selectable Service / Software offer type.

The product goal is a selectable business decision, competitor positioning, price/profit check, or small-budget sales test. `productCategory` and `researchGoal` are optional brief fields so existing briefs, report histories and approved snapshots remain valid without a migration. Changing them creates a revised brief and requires new research/review.

Selecting a saved product imports its description, category and selected ad references. Saved product prices, costs, images and inventory are displayed and passed to the research engine. Cost summaries include payment percentage fees and the owner's failed-order assumptions. The allowable advertising cost is an economic constraint per delivered sale, not a forecast of achievable CAC or profit. Price-dependent economics stay unavailable when the selling price is unknown.

When that product already has a brief, the form offers **Open existing product research** and prevents the ordinary duplicate save path. Existing history and decisions are opened rather than overwritten. Concurrent tabs still use the existing idempotent product-to-brief API handoff.

**Ad Library research** is the evidence board: observed ads, advertiser offers, hooks, creatives, dates and saved ad analyses. **Product research** evaluates that evidence alongside actual costs, supplier/quality checks, buyer need, fulfillment/COD risk and alternatives to reach a business/test decision. It reuses saved ad context; it does not automatically repeat per-ad AI analysis. A saved ad is not proof of a profitable product. Source quality and missing evidence still determine confidence.

Unchanged requests reuse structured research outputs for up to 12 hours. Cache outputs are copied on save/return, so report enrichment or concurrent callers cannot mutate the reusable source object. A new goal, question, evidence set, product fact or model setting changes the cache key; explicit fresh research also bypasses reuse.

No new provider, external ad collection API, campaign activation or subscription feature is introduced.

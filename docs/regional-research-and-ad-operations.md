# Regional research and ad operations

This release connects country/state/region/city research to approved campaign targeting, account monitoring and recorded business outcomes. Subscription billing is intentionally omitted at the owner's request.

## User workflow

1. Open Research studio and create or edit a brief. Search the country catalog by name or ISO code and choose up to ten countries.
2. In States, regions & cities, choose a candidate country and search a region or city in Meta. Choose up to eight regional candidates. Location discovery needs a verified workspace Meta integration in live mode; demo locations are explicitly marked.
3. Run research. The provider must compare every selected country and region once; omitted, duplicated or invented location IDs fail validation and receive only the existing bounded repair. Regional market claims remain hypotheses, even with web sources. Whole-country statistics do not establish regional demand.
4. Edit the test-market decision. Select one test country and optionally its researched regions. Selecting no region means the whole country. Request review and obtain approval. Editing the brief or decision creates a new version and invalidates dependent approvals.
5. Prepare a campaign draft. The regional decision is carried into targeting automatically. One ad set shares the selected areas and budget; adding the entire country to the regional payload would widen targeting and is prevented. Service campaigns retain the $3/day starter converted into the connected account currency. Bangladesh product campaigns default to at most BDT 300/day, constrained by both product and workspace ceilings; the user may explicitly choose another valid budget.
6. Approve the exact campaign draft separately before execution. Verify the public client landing page, actual image/video, conversion event and real pixel installation. Research approval alone does not authorize an ad launch.
7. Use Ad control center to check the account inventory and regional delivery, then Campaign operations to sync insights or propose managed campaign changes. Targeting changes can narrow within approved regions; a new region requires a new research decision.
8. Record each real order or client enquiry in Actual business results with a unique reference, status, date and source. Received money, refunds and incurred costs use the campaign account currency. Reusing the campaign/reference updates the record instead of counting it twice. Incorrect records can be voided by administrators/approvers and remain audited. CSV export respects the selected dates and protects spreadsheet users against formula injection.

Follow-up research receives the recorded outcomes and synchronized spend of campaigns linked to that same project. Other projects and workspaces are excluded. Stored audience recommendations retain the canonical regions used by the campaign. Outcome edits include a revision check and before/after monetary values in the audit log.

## Accounting boundaries

Campaign-level Meta spend is counted once; ad/ad-set spend is not added again. Received customer payments minus refunds are separate from platform-attributed revenue. Contribution after advertising is received payments minus recorded actual costs minus synchronized advertising spend. Missing spend, costs or outcomes remain unknown. Results are not accounting profit: taxes, overhead, offline attribution and omitted costs still need correct entries. Different currencies are never summed together.

The automatic analyzer withholds budget-increase recommendations until recorded customer outcomes show at least twenty confirmed sales and positive recorded contribution after advertising. Twenty is a conservative product policy, not a statistical guarantee. The analyzer still requires approval for every suggested change. Manual budget changes remain subject to approval, original product/offer ceilings and workspace reservations. No paid ads are launched by account checks, research or outcome entry.

## Engineering boundaries

- Meta location records are tenant-scoped, immutable catalog entries tied to the connected account. The model cannot create location keys. Campaign fingerprints include canonical region snapshots; execution checks them against the approved research and delivery coverage.
- Physical products retain Bangladesh fulfillment rules. Specific region/city IDs must match verified business and product delivery areas, or both must explicitly support nationwide delivery. International physical-product fulfillment is not implemented.
- Redis atomically enforces API/login limits and exclusive research/account-check leases across API instances. Concurrent research for the same workspace/project returns a conflict before an extra provider call. The lease is five minutes, longer than the provider deadline; a failed unlock expires naturally.
- MongoDB unique indexes protect campaign/reference identities and location catalog identities. Existing country-only brief hashes and approved versions stay compatible because new regional fields are optional.
- Account snapshots use only authenticated GETs to the account owning the workspace integration. Pagination follows opaque cursors on the fixed Graph API host; it never follows arbitrary next URLs. Each inventory edge is limited to five pages of one hundred rows and explicitly marks truncation. Regional reporting restrictions are reported as unavailable, never replaced with fabricated numbers.
- Live mutation checkpoints, approval expiry, stale action checks, private R2 media, encrypted workspace keys, audited roles and aggregate budget reservations remain in effect. Ambiguous Meta writes require reconciliation; they are not automatically retried.

## Honest product scope

The dashboard supports the application's reviewed website lead/purchase campaigns and displays accessible campaigns created elsewhere. It does not yet adopt or mutate externally created campaigns. Account payments, identity verification, Meta app review, restricted-account appeals and permission grants can require Meta's own interface. Messaging objectives, instant forms, catalogs, retargeting/customer-list audiences, special ad categories, CRM/courier integrations, conversion API event ingestion, automated billing, email recovery/MFA and a public SaaS onboarding/OAuth flow are not implemented by this release. Do not market it as a replacement for every Meta interface or as a fully launched public SaaS.

Country labels use Unicode CLDR data; its license is included in `src/modules/research/UNICODE-LICENSE.txt`. Administrative naming and available targeting types come from Meta, rather than a fabricated fixed list of states for every country.

## Verification on 2026-10-08

- 91 automated tests passed, including a real MongoDB replica set; seven browser workflows passed, including regional service research/approval/campaign preparation, customer outcome updates, CSV export and English/Bangla mobile rendering.
- The connected live Meta account returned Ontario (CA, region key 533), Bayern (DE, key 826) and Dhaka Division (BD, key 4373). Campaign, ad-set, ad and regional insight inventory endpoints accepted the requested fields. No campaigns or delivery history existed in the checked account; no performance was fabricated.
- Redis locking was verified with independent callers: a second caller could not run the same operation concurrently. Independent rate-limit stores shared one atomic counter.
- A separate native OpenAI research verification used the configured `gpt-6-luna` model with High reasoning and native web search. It returned both requested countries and both regions, six retrieved source URLs and three search calls. The report declined to rank markets without regional buying-intent evidence. This verifies retrieval and structured coverage; it is not proof of regional demand or future ad performance.
- The owner's existing approved version 5 and Canada decision remained unchanged. Live browser verification made no campaign or approval writes. Paid execution was tested only in demo mode.
- A cached-account navigation race was reproduced and fixed: research project selection stays visibly disabled while a foreground account check runs, so the click is not silently discarded. A browser regression test holds the account request in progress and verifies that project selection works when it completes.

# Product Studio: costs, images and multiple-product ads

## Product entry

Choose **Products → Add product → Automatic**. Enter the product selling price (without delivery), unit purchase/manufacturing cost, packaging cost, full courier charge, customer delivery charge, and actual available inventory. The calculator updates in the form and the server recalculates before saving. `?` buttons explain each field on hover, keyboard focus or a mobile tap. Advanced fees/returns stay collapsed until needed. Existing products keep their previous manual calculations when edited.

Example: selling price BDT 1,000, unit cost 400, packaging 20, courier charge 100, customer delivery charge 60, no payment fee, return shipping 40. Net successful-delivery cost is 40. Failed-order loss is 160, because the customer delivery fee is not collected on a failed order. At a **planning assumption** of 10% failed orders, expected failure loss per delivered order is `10 / 90 × 160 = 17.78`. Contribution before ads is 522.22. Reserving 30% leaves a profit goal of 156.67 and an allowable acquisition cost of 365.55. Those numbers are accounting limits, not predicted advertising performance.

Automatic loss assumes returned stock is reusable. COD/mixed 10% and prepaid 5% defaults are visible examples, not measured Bangladesh benchmarks. Replace them with your own measured history. Refunds, lost/damaged stock and nonstandard recovery costs need manual inputs. Automatic mode supports customer delivery charges up to the actual courier charge; additional delivery income is outside this calculator. Percentage payment fees also account for the collected delivery charge. Actual courier/processing fees must be entered; no tariff is invented.

## Image analysis

Upload a primary image and optionally select additional uploaded photographs (six distinct images total). **Analyze product images with AI** sends actual image bytes through the workspace's saved OpenAI or Gemini connection. It returns visible observations, text, discrepancies, unconfirmed claims and an editable description draft. Applying the draft is a separate owner action. Research and copy also receive this visual analysis. Videos are not silently treated as photographs.

Analysis is cached by image checksum, supplied product facts, provider and model. Raw image bytes are not saved in analysis records or audits. Only owned, ready files are read. A photograph cannot establish authenticity, exact material, supplier claims, demand or profitability. Research uses the existing configured research model and reasoning level; there is no automatic expensive model upgrade.

## Multiple products

On **Products**, choose **Several products - swipe cards**. Select 2–10 related products with actual prices, in-stock units, HTTPS product pages and primary images. Enter a collection URL and one shared daily planning amount/test duration. The prepared carousel uses one campaign/ad set, with each image card opening its own product page. Each product keeps separate economics; the system does not invent a blended selling price or a discounted bundle. The most restrictive allowable acquisition cost is a conservative guardrail.

Live group research runs as a durable Redis worker job and remains visible after leaving/reloading the page. Duplicate pending requests are reused. Queued product snapshots are checked before work. Completed results are reused after worker recovery, and full research is not automatically retried repeatedly at the owner's expense. Provider-level transient retries still apply. Errors leave saved products intact and appear beside the request.

Review the plan, research, pictures, destinations and budget, then request approval. Default launch mode remains **Manual guided launch**. Approval produces a copyable carousel guide; it spends no money. Direct API launch still requires a separate approved action, successful preflight, correct Meta permissions and a compatible app/account. Product or workspace policy changes invalidate stale plans; changing a linked product also invalidates its new research decision.

## Catalogue, dynamic ads and collection

Choose **Catalogue / dynamic ads guide** for a stable RSS product feed. Sharing selected product details/images requires an explicit checkbox and an approver role. Add the secret feed URL as a scheduled source in Meta Commerce Manager. Pixel event `content_ids` must match the feed's product UUIDs. The feed reads current stock/prices; revocation disables both its feed and image URLs. Anyone with the secret link can fetch the selected public product data/images, so keep it private and revoke it when unused.

The guide explains catalogue diagnostics, product sets, website events and low-budget setup. Creating a feed does **not** create a Meta catalogue, publish an ad or satisfy Commerce policies. Collection ads additionally need an Instant Experience prepared and previewed in Meta. Native catalogue/Instant Experience provisioning is outside this version; these steps are clearly shown as manual.

## Confidence

Confidence describes available evidence, not the likelihood of success. AI findings stay hypotheses. Photos and retrieved search links alone do not raise checked market confidence. Current rules: Low when fewer than two recent independent sources have been checked by the owner; Medium with at least two; High additionally requires at least three sources and 20 recorded confirmed sales. Recent means within 30 days. These are transparent product rules, not statistical proof or an independent audit. Actual profitable acquisition still requires measured spend, delivered orders, costs and refunds. No model or platform can guarantee zero advertising failures.

## Validation

Backend checks cover calculator arithmetic, collected delivery fees, server recomputation, images/checksums/workspace boundaries, stale product research, carousel payload/approval budgets, durable request reuse, confidence provenance, catalogue XML and revocation of feed/image capabilities. Browser tests cover product defaults/help/translation, carousel approval and mobile layout. Live checks must never execute or activate paid ads without the separate approved action.

## Delivery fee presets

In automatic product costs, the user-provided courier presets are inside Dhaka 80 BDT and outside Dhaka 120 BDT. Selection recalculates successful delivery costs, failed-order loss and contribution. Custom mode keeps the amount editable. Customer delivery collection is a separate actual input; the explicit same-fee button copies the courier amount. Selecting a lower preset caps an existing customer charge at that new courier amount, within the calculator supported range. Delivery presets do not change ad targeting or mutate saved products without saving. These are this business's entered presets, not carrier tariffs or national averages.

# Beginner campaign setup

Approve a research decision and choose **Prepare campaign draft**. The form carries the approved country, offer, buyer profile, and research version into the draft. The default service goal is website enquiries.

The **Use $3/day starter** button proposes seven days. For a USD account that is $3/day and $21 total. Other supported currencies use an indicative reference rate from ExchangeRate-API, with its date and attribution shown. Budget values are always sent in the connected account currency. No account currency, workspace ceiling, or live campaign is changed by the preset. Failed or stale rate retrieval leaves manual entry available; it never substitutes 3 local currency units for $3.

Add your actual public service/contact page and a real image or video. Video also needs a cover image. Every setup field has a question button: hover or focus on desktop, tap on mobile, and Escape to dismiss. Help is available in English and Bangla.

Keep project economics **unknown** for a small discovery test. Price, delivery cost, required profit, and lead close rate stay null, with no acquisition or profit forecast. To enter a project price, supply real delivery cost and profit requirements too. The project price is what a client pays, not your daily advertising budget.

Review daily budget, test days, and total. The ceiling normally follows budget and duration; it can be edited separately. Existing drafts are preserved, and applying the starter preset is explicit for those drafts. Daily budgets are averages, not exact daily charges. Card fees, taxes, Meta budget minimums, and ad review can affect delivery or charges. The app does not automatically increase the budget or renew the test.

Check the small-test acknowledgement and generate a draft. Review the ad copy, media, budget, and validation. Campaign launch requires a separate approval.

## Implementation

Authenticated `GET /api/campaigns/budget-preset` reads the selected workspace account currency. Reference USD rates are cached in-process for an hour, concurrent requests share retrieval, and failures use a five-minute cooldown. Rates older than 48 hours are rejected. USD needs no external rate request. No credential is sent to the rate provider.

`servicePlanInput` accepts null costs/profit for unknown pricing; a supplied project price requires real cost/profit values. Regression checks cover conversion, cache sharing, stale rates, outages, unknown economics, translated tooltips, decimal budget editing, and the existing campaign approval flow in demo mode. Paid ad delivery is not tested by these checks.

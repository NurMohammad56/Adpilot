# Manual guided launch

AdPilot's campaign review defaults to **Manual guided launch**. Existing API approvals retain their original direct mode. Switching modes on a draft requires a new approval whose fingerprint includes the selected launch mode. Manual approval cannot call HTTP, MCP or internal campaign execution.

## ব্যবহার

1. **Campaign plans → Review** খুলুন। **Manual guided launch** নির্বাচন করা থাকবে।
2. **Manual guide**-এ Campaign → Ad set → Ad ধাপ খুলে setting দেখুন। প্রতিটি field-এর **?**-তে hover, keyboard focus অথবা mobile tap করলে সাহায্য পাওয়া যায়।
3. Country/state/region, account currency, total budget, public website URL ও creative মিলিয়ে নিন। কম creative চাইলে **Edit & revalidate** করে অতিরিক্ত creative বাদ দিন। নতুন version-ই approve করুন।
4. **Request manual guide approval → Approve guide** দিন। এতে কোনো বিজ্ঞাপন চালু বা খরচ হবে না।
5. **Open Facebook Ads Manager** খুলুন। Copy button দিয়ে field-এর লেখা নিন। Media download করে upload করুন। Budget-এর Copy শুধু সংখ্যাটি কপি করে; currency আগে মিলিয়ে নিন।
6. একটি campaign ও একটি ad set রাখুন। Lifetime budget হলে মোট বাজেট একবার ad set-এ দিন; প্রতিটি ad-এর জন্য একই budget আলাদা করে দেবেন না। Daily amount একটি planning average। Tax ও payment fee আলাদা।
7. Account timezone অনুযায়ী start/end date দিন। Website form/checkout ও আসল Pixel event পরীক্ষা করুন। Meta বেশি minimum budget চাইলে নিজে বাড়িয়ে না দিয়ে নতুন plan review করুন।
8. Facebook-এ নিজে Publish করুন। তারপর Campaign ID এনে **Save ID & check settings** দিন। Ad set ID বা Ad ID দেবেন না।
9. **Recheck Facebook settings** দিয়ে আবার read করুন। **Performance** থেকেও linked guide খুলতে পারবেন।

## What verification proves

The read-only check confirms campaign account ownership before reading ad sets and creatives. It compares the objective, currency, ad set count, budget type/amount, duration, locations, ages, placements, Pixel/event and returned copy/CTA/Page/URL against the approved snapshot. It checks bounded pagination and never follows Meta `paging.next` URLs or submits mutations. It reports attributed delivery insights for the last 30 days when available; missing results are not replaced by invented figures.

“Readable settings match” is deliberately narrower than complete verification. Media bytes, live website event delivery, unavailable creative fields, audience expansion, policy eligibility and placement previews still require manual checks. A saved but unreadable ID is **unverified**, not an active or successful launch. Different account IDs are rejected. Other read failures retain the user-reported ID with diagnostics so it can be rechecked.

Linked manual campaigns stay separate from API-managed campaigns and retain their research/plan/approval references. They appear in Performance with a link back to their guide. Pause, resume, creative changes and budget changes for these manual records happen in Facebook; they do not silently obtain API execution permission. Their reviewed budgets also reserve workspace limits for subsequent API launches. External edits/spending can only be observed, not prevented, by AdPilot.

## Direct launch

Choose **Direct launch from AdPilot** to use the existing API workflow. It still requires a fresh successful Meta readiness check, exact human approval and live execution readiness. The current Development-mode creative error (`100 / 1885183`) blocks this workflow until Meta permits the creative operation. Manual guidance does not change that permission or publish the Developer App.

Research is reused without another LLM request. Budget suggestions do not guarantee sales, qualified leads, CPA or profit.

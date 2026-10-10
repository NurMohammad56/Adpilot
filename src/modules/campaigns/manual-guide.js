// Deterministic presentation of the reviewed plan. No model calls, currency conversion or
// invented performance predictions occur here. This module also runs in the browser.
export function manualGuide(plan, integration = {}) {
  const b = plan.budgetRecommendation,
    a = plan.audienceRecommendation;
  const field = (label, value, help, bn) => ({
    label,
    value: String(value ?? 'Not provided'),
    copyValue:
      label === 'Budget amount'
        ? Number(b.deliveryMode === 'lifetime' ? b.totalBudget : b.dailyBudget).toFixed(2)
        : String(value ?? ''),
    help,
    bn,
  });
  const currency = plan.accountCurrency || integration.currency || 'BDT';
  const regions = a.geoTargets?.length
    ? a.geoTargets.map((t) => `${t.name} (${t.type}, Meta ID ${t.key})`)
    : a.locations.map((location) =>
        /^[A-Z]{2}$/.test(location)
          ? `${new Intl.DisplayNames(['en'], { type: 'region' }).of(location)} (${location})`
          : location,
      );
  const amount = (n) => `${Number(n).toFixed(2)} ${currency}`;
  return {
    planId: plan.id,
    fingerprint: plan.fingerprint,
    researchVersionId: plan.researchVersionId || null,
    accountId: integration.adAccountId || null,
    currency,
    adsManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns${integration.adAccountId ? `?act=${integration.adAccountId}` : ''}`,
    sections: [
      {
        title: 'Campaign',
        fields: [
          field(
            'Ad account',
            integration.adAccountId,
            'Select this account in Ads Manager; confirm its currency before entering a budget.',
            'Ads Manager থেকে এই account নির্বাচন করুন। বাজেট দেওয়ার আগে currency মিলিয়ে নিন।',
          ),
          field(
            'Campaign name',
            plan.name,
            'Copy this name to keep the campaign connected to this reviewed plan.',
            'এই নামটি কপি করুন, যাতে approved plan-এর সঙ্গে campaign চেনা যায়।',
          ),
          field(
            'Objective',
            plan.objective === 'OUTCOME_LEADS' ? 'Leads' : 'Sales',
            'Use the approved objective. A website lead is an enquiry, not a confirmed sale.',
            'অনুমোদিত goal নির্বাচন করুন। Website lead মানে enquiry, নিশ্চিত বিক্রি নয়।',
          ),
          field(
            'Campaign budget',
            'Off — use ad set budget',
            'Keep one ad set and put the reviewed budget there. Do not add a separate campaign spending cap.',
            'একটি ad set রাখুন এবং সেখানেই বাজেট দিন। আলাদা campaign spending cap যোগ করবেন না।',
          ),
          field(
            'Special ad categories',
            'None — confirm eligibility',
            'If the offer is a regulated special category, stop and revise the plan before publishing.',
            'আপনার offer বিশেষ নিয়ন্ত্রিত category-তে পড়লে publish বন্ধ রেখে plan সংশোধন করুন।',
          ),
        ],
      },
      {
        title: 'Ad set',
        fields: [
          field(
            'Ad set name',
            `${plan.name} · Primary`,
            'Use one ad set for this small test. More ad sets divide the same budget.',
            'কম বাজেটে এই test-এর জন্য একটি ad set রাখুন। বেশি ad set হলে বাজেট ভাগ হয়ে যায়।',
          ),
          field(
            'Conversion location',
            'Website',
            'The destination must be your actual public offer or product page.',
            'মানুষকে আপনার প্রকৃত public offer বা product page-এ পাঠান। AdPilot dashboard-এর URL নয়।',
          ),
          field(
            'Performance goal',
            'Maximize number of conversions',
            'If unavailable for this objective, do not substitute a different goal silently; review the plan.',
            'এই option না থাকলে অন্য goal দিয়ে চালাবেন না; plan আবার review করুন।',
          ),
          field(
            'Dataset / Pixel',
            integration.pixelId,
            'Select this dataset. Test a real website event in Events Manager; a saved ID alone does not prove tracking works.',
            'এই dataset নির্বাচন করুন। Events Manager-এ website-এর আসল event পরীক্ষা করুন; ID save থাকলেই tracking কাজ করে এমন নয়।',
          ),
          field(
            'Conversion event',
            plan.conversionEvent === 'LEAD' ? 'Lead' : 'Purchase',
            'Lead must fire after a genuine enquiry; Purchase after a confirmed order. Verify event setup before publishing.',
            'আসল enquiry হলে Lead, confirmed order হলে Purchase পাঠাতে হবে। Publish-এর আগে event setup পরীক্ষা করুন।',
          ),
          field(
            'Budget type',
            b.deliveryMode === 'lifetime' ? 'Lifetime budget' : 'Daily budget',
            'Use the displayed type. A daily budget is not a strict daily spend limit; taxes and fees are additional.',
            'দেখানো budget type ব্যবহার করুন। Daily budget কঠোর দৈনিক খরচসীমা নয়; tax ও fee আলাদা।',
          ),
          field(
            'Budget amount',
            amount(b.deliveryMode === 'lifetime' ? b.totalBudget : b.dailyBudget),
            'This is ad spend in the connected account currency, not your product price. Do not type 3 in a BDT account to mean USD 3.',
            'এটি account currency-তে বিজ্ঞাপনের বাজেট, product-এর দাম নয়। BDT account-এ 3 লিখলে USD 3 বোঝাবে না।',
          ),
          field(
            'Schedule',
            `${b.durationDays} days; set both start and end; timezone ${integration.timezone || 'confirm in Ads Manager'}`,
            'Choose a future start and end exactly this many days apart, using the account timezone. For a daily-budget plan, monitor cumulative spend against the reviewed total.',
            'Account timezone অনুযায়ী future start ও end দিন, দুটির ব্যবধান এই কয় দিন হবে। Daily budget হলে মোট খরচ approved total-এর মধ্যে আছে কি না নজর রাখুন।',
          ),
          field(
            'Total reviewed ad spend',
            amount(b.totalBudget),
            'The fixed lifetime amount is the total ad budget. Daily spending can vary; tax and payment fees are extra. Meta may impose a minimum budget; do not increase it without a new review.',
            'Lifetime amount-ই মোট ad budget। প্রতিদিন খরচ কম-বেশি হতে পারে; tax/payment fee আলাদা। Meta বেশি minimum চাইলে অনুমোদন ছাড়া বাড়াবেন না।',
          ),
          field(
            'Locations',
            regions.join('; '),
            'Select these exact countries, states/regions or cities. Do not add the entire country when the approved plan targets only specific regions. Disable expansion outside approved locations where controls allow.',
            'শুধু এই approved দেশ/state/region/city নির্বাচন করুন। Region নির্বাচন থাকলে পুরো দেশ যোগ করবেন না। Location-এর বাইরে expansion বন্ধ রাখুন।',
          ),
          field(
            'Age',
            `${a.ageMin}–${a.ageMax}`,
            'Use the reviewed range as a control where available; do not treat an audience suggestion as a strict restriction.',
            'Approved age range ব্যবহার করুন। Audience suggestion কঠোর restriction নয়—control আছে কি না দেখুন।',
          ),
          field(
            'Audience approach',
            'Broad; no invented interest targeting',
            'Ad copy and qualification questions should address the researched buyer. Do not enter the buyer description as an unverified Meta interest.',
            'Research-এর buyer অনুযায়ী copy ও qualification প্রশ্ন রাখুন। Buyer-এর বর্ণনাকে বানানো Meta interest হিসেবে লিখবেন না।',
          ),
          field(
            'Placements',
            'Manual: Facebook and Instagram; mobile and desktop',
            'Keep the reviewed platforms. Preview and adapt existing media for every selected placement; remove a placement only after revising the plan.',
            'Approved platform রাখুন। প্রতিটি placement-এ media preview করুন। Placement বদলালে plan আবার review করুন।',
          ),
          field(
            'Bid strategy',
            'Highest volume / lowest cost; no cost cap',
            'A small exploratory test has no verified CPA guarantee. Do not invent a target cost.',
            'ছোট exploratory test-এ verified CPA guarantee নেই। অনুমান করে cost cap দেবেন না।',
          ),
        ],
      },
      {
        title: 'Ad',
        fields: [
          field(
            'Facebook Page',
            integration.pageId,
            'Select your Page, not the Developer App. Check the Page name in the preview.',
            'Developer App নয়, নিজের Page নির্বাচন করুন। Preview-তে Page-এর নাম মিলিয়ে নিন।',
          ),
          field(
            'Instagram identity',
            'Select your linked business profile if available',
            'Confirm the identity permitted for your selected placements. Never use another client’s profile.',
            'Placement অনুযায়ী অনুমোদিত identity দিন। অন্য client-এর profile ব্যবহার করবেন না।',
          ),
          field(
            'Ad setup',
            'Create ad; single image or video for each creative',
            'Upload the saved creative below. Keep automatic text or creative enhancements off if they would change the approved message.',
            'নিচের saved creative upload করুন। Approved message বদলে দিতে পারে এমন automatic enhancement বন্ধ রাখুন।',
          ),
          field(
            'Website URL',
            plan.landingUrl,
            'Open and test the public page and enquiry/checkout flow on mobile before publishing.',
            'Publish-এর আগে mobile-এ এই public page ও enquiry/checkout flow খুলে পরীক্ষা করুন।',
          ),
        ],
      },
    ],
    creatives: plan.ads.map((ad) => ({
      id: ad.id,
      headline: ad.headline,
      primaryText: ad.primaryText,
      cta: ad.cta || 'SHOP_NOW',
      mediaAssetId: ad.mediaAssetId,
      thumbnailAssetId: ad.thumbnailAssetId,
      imageUrl: ad.imageUrl,
      mediaType: ad.mediaType,
      concept: ad.concept,
    })),
    buyer:
      a.segments
        ?.filter((s) => s.active)
        .map((s) => s.profile)
        .join('\n') || a.reason,
    unknowns:
      'CPA, leads, purchases and profit are not guaranteed. Review actual qualified leads/orders before scaling.',
  };
}

# সহজ ব্যবহার, বাংলা ইন্টারফেস এবং R2

এই workspace-এ private Cloudflare R2 storage চালু হয়েছে। Bucket credentials শুধু server-এর Git-ignored `.env`-এ আছে; browser বা client workspace-এ পাঠানো হয় না। Authenticated upload, সম্পূর্ণ download, byte-range download এবং anonymous access প্রত্যাখ্যান বাস্তব bucket দিয়ে পরীক্ষা করা হয়েছে। Test file মুছে দেওয়া হয়েছে; configuration বদলানোর আগে কোনো পুরোনো media asset ছিল না।

## ইন্টারফেস

- উপরের **বাংলা / English** বোতামে dashboard-এর labels, instructions, statuses ও errors-এর ভাষা বদলান। ভাষা browser-এ মনে থাকে। আপনার লেখা product name, brief, copy এবং account IDs বদলায় না। বাংলা নির্বাচন করে নতুন country research চালালে AI-কে বাংলা analysis লিখতে বলা হয়; আগের সংরক্ষিত report স্বয়ংক্রিয়ভাবে পুনর্লিখিত হয় না।
- বড় labels, minimum 16px form input, বড় buttons, পরিষ্কার spacing ও mobile layout আছে। Overview থেকে Accounts → product costs অথবা research → campaign review → approval → results-এ যেতে পারবেন।
- অসমাপ্ত product, research brief, follow-up, decision ও service campaign inputs এই browser tab-এ workspace/user/project/version অনুযায়ী সংরক্ষিত থাকে। Account token, app secret ও AI key browser draft-এ রাখা হয় না। Tab বন্ধ করলে এই অস্থায়ী draft হারাতে পারে; সংরক্ষিত research ও campaign versions MongoDB-তে থাকে।

## Accounts-এর সঠিক IDs

**Ad account ID** হলো Ads Manager-এর সংখ্যার ID; email নয়। `act_` prefix গ্রহণ করা হয়। **Facebook Page ID** Page transparency/About থেকে পাবেন; Developer **App ID** এখানে দেওয়া যাবে না। **Pixel / dataset ID** Events Manager-এ পাবেন। Token এবং Facebook login password আলাদা।

প্রতিটি field-এ নির্দেশনা, password-manager autofill এড়ানোর settings ও inline error আছে। Connected workspace-এ আগের numeric IDs দেখা যাবে; token খালি রেখে **Verify & save Meta account** করলে ওই workspace-এর encrypted token দিয়ে connection পুনরায় যাচাই হবে। অন্য client-এর জন্য আলাদা workspace করুন।

## বাংলাদেশে physical product

1. Products-এ category dropdown বা **Other** দিয়ে নিজের category দিন। Payment method ও delivery coverage বেছে নিন। প্রকৃত cost, inventory ও profit requirement লিখুন। Return rate-এ `10` মানে `10%`; margin-এ `20` মানে `20%`।
2. খরচ লিখলেই expected failed-delivery loss, variable cost এবং allowable advertising cost দেখবেন। Budget সীমার বাইরে গেলে validation আটকে দেবে। COD return-rate scenarios খরচের প্রভাব দেখায়; এগুলো market forecast নয়।
3. ছবি/video Media library অথবা product/campaign form থেকেই upload করুন। Video-তে uploaded image cover লাগবে। Images সর্বোচ্চ 10 MB, videos 50 MB; workspace quota 2 GB।
4. সরাসরি campaign plan তৈরি করুন, অথবা Research-এ physical product brief-এর সঙ্গে saved product link করুন। Bangladesh নির্বাচন করে research decision approve করলে **Create Bangladesh product campaign** পাওয়া যাবে। Campaign-এ ওই approved report ও product costs/media সংযুক্ত থাকবে।
5. Copy, economics, media ও budget পরীক্ষা করে আলাদা launch approval দিন। Research approval কোনো ad চালায় না।

## আন্তর্জাতিক digital service / software

Research-এ guided example থেকে custom ecommerce, business website অথবা software brief শুরু করতে পারেন। Suggested country lists শুধু গবেষণার candidates। নিজের offer, buyer, delivery capability এবং dated sources যুক্ত করুন। সর্বোচ্চ 10টি country একসঙ্গে তুলনা করুন।

Follow-up প্রশ্ন করে নতুন version তৈরি করুন; conclusion edit করে country নির্বাচন করুন এবং current research decision approve করুন। তারপর website leads অথবা purchases campaign draft বানান। প্রকৃত price/delivery cost/required profit এবং measured lead-to-sale rate দিন। Unknown economics-এ CPA বানিয়ে দেওয়া হয় না; capped discovery test বুঝে স্বীকার করতে হবে। Campaign draft-এ আলাদা approval লাগবে।

Research বা brief পরিবর্তিত হলে পুরোনো report-এর approval আর campaign launch-এর জন্য চলবে না। Plan থেকে source research-এ ফিরে যেতে পারবেন। Workspace বদলে অন্য client-এর account/media/research ব্যবহার করা যায় না; stale tab request server প্রত্যাখ্যান করে।

## ব্যর্থতা ও বর্তমান সীমা

Accounts-এ **OpenAI** বা **Google Gemini** বেছে নেওয়া যায়। বর্তমান workspace-এ OpenAI `gpt-6-luna`, research thinking **High** এবং live web search চালু আছে; copy-তে একই model-এর Low reasoning ব্যবহার হয়। Saved key রাখতে ঘর খালি রাখুন; provider বদলালে নতুন key প্রয়োজন। Research-এর country coverage, recommendation ও output schema যাচাই হয়; অসম্পূর্ণ হলে একই model দিয়ে একবার repair হয়। নতুন report-এ Search সফল হয়েছে কি না, source count ও model/thinking দেখা যায়। Citation খুলে তথ্যের তারিখ ও প্রাসঙ্গিকতা যাচাই করুন।

Google-এর **Deep Research agent** একটি পৃথক Interactions/background API; সেটি এই release-এ যুক্ত করা হয়নি। High-thinking structured country research-কে ওই agent বলে দাবি করা হচ্ছে না। [Google Deep Research documentation](https://ai.google.dev/gemini-api/docs/deep-research), [thinking configuration](https://ai.google.dev/gemini-api/docs/thinking)।

Connection সমস্যা হলে form draft থাকে। Read request সীমিত retry পায়; submitted campaign action স্বয়ংক্রিয় replay হয় না। Meta partial creation/checkpoints, budget reservations, transaction, hash bindings ও reconciliation guards আছে। এগুলো ব্যর্থতার প্রভাব কমায়; বাইরের API বা hosting কখনো ব্যর্থ হবে না—এমন নিশ্চয়তা নেই।

Search quota বা সাময়িক provider সমস্যায় source পাওয়া না গেলে report-এ সেটি স্পষ্ট লেখা থাকে; supplied evidence ও AI hypotheses ব্যবহার হয়। Invalid API key উপেক্ষা করা হয় না। বর্তমান workspace-এ OpenAI web search সফল ও চালু আছে; Gemini Search-এর আগের quota সমস্যা আলাদা provider-এর সীমা।

Live site: https://fahimstack.tech/adpilot/ । Login, API, Redis worker, private R2 এবং বাংলা mobile Accounts UI যাচাই হয়েছে। OpenAI key encrypted workspace Accounts-এ সংরক্ষিত; শুধু `.env` বদলালে saved workspace key বদলায় না। আসল ১০ দেশের brief-এর বাংলা report ও follow-up GPT-6 Luna High reasoning এবং live source citation দিয়ে তৈরি, সংরক্ষণ ও desktop/mobile-এ যাচাই হয়েছে। Latest report **Version 4**। বাংলাদেশের product research এবং তিনটি creative variant-ও সফল। কোনো paid ad চালানো হয়নি। বিস্তারিত: [OpenAI research](openai-research.md), [deployment guide](deployment.md) এবং [verification record](verification.md)।

Operator checks: `node scripts/smoke-storage.js`, `node scripts/smoke-media-live.js`, `node scripts/smoke-live.js`. প্রথম দুইটি নিজস্ব অস্থায়ী probe পরিষ্কার করে; শেষটি configured Meta connection read-verify করে। Regression/browser tests পৃথক demo data ও local files ব্যবহার করে।

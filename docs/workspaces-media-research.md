# Workspaces, media and iterative research

These features implement the user's expanded request after the original Bangladesh physical-product brief. They work in the existing application; service campaigns reuse the same audited approval/MCP execution path.

## ব্যবহার করার নিয়ম

1. **Accounts** খুলুন। নিজের ব্যবসা বা client-এর জন্য আলাদা workspace তৈরি করুন। সেই workspace-এ Meta ad account ID, Page ID, Pixel ID, access token এবং প্রয়োজন হলে app secret দিন। OpenAI বা Gemini provider, API key এবং copy/research model বেছে নিন। Connection verification-এর পরে credentials encrypted অবস্থায় MongoDB-তে থাকে। অন্য workspace এই তথ্য ব্যবহার করতে পারে না।
2. **Media library** থেকে ছবি বা ভিডিও আপলোড করুন। Campaign draft-এর creative editor-এ সেই ফাইল নির্বাচন করুন। ভিডিওর জন্য একটি uploaded image cover-ও নির্বাচন করুন।
3. **Research**-এ project তৈরি করুন: কী বিক্রি করবেন, কার কাছে বিক্রি করবেন, সম্ভাব্য দেশ এবং কী জানতে চান লিখুন। Physical product, service ও software আলাদা brief হিসেবে নেওয়া যায়। আপনার custom ecommerce development উদাহরণটি **Service** হিসেবে দিন।
4. প্রয়োজন হলে competitor page, buyer interview বা অন্য market observation-এর source ও তারিখ যুক্ত করুন। ৩৫ দেশের তালিকা থেকে একবারে সর্বোচ্চ ১০ দেশ তুলনা করুন।
5. Research চালান। দেশভিত্তিক buyer segments, competition, ভাষা, সুযোগ, বাধা, uncertainty এবং test approach দেখুন। Follow-up প্রশ্ন দিয়ে আবার research করুন। Summary, country analysis এবং সিদ্ধান্ত edit করলে নতুন version তৈরি হয়; আগের version history-তে থাকে।
6. যথেষ্ট তথ্য পাওয়ার পরে test country ও সিদ্ধান্তের কারণ ঠিক করে review-তে পাঠান। Administrator/approver বর্তমান research version approve বা reject করতে পারেন।
7. অনুমোদিত service/software সিদ্ধান্ত থেকে campaign draft তৈরি করুন। Website lead বা purchase goal, HTTPS landing page, বাস্তব খরচ, budget, duration এবং uploaded media দিন। Cost per acquisition জানা না থাকলে capped discovery test হিসেবে acknowledge করতে হবে।
8. Campaign draft-এর copy, media, audience, economics ও budget review/edit করে আলাদা launch approval নিন। Live execution চালু থাকলে approved execution campaign, ad set, creatives এবং ads তৈরি করে; research approve করা একা বিজ্ঞাপন চালায় না।

নতুন research চালালে বা brief বদলালে আগের সিদ্ধান্তের অনুমোদন নতুন campaign-এর জন্য ব্যবহার করা যাবে না। Campaign approval-ও exact version, account, budget, copy ও media checksum-এর সঙ্গে বাঁধা।

## Client and credential boundaries

One workspace connects one Meta account/Page/pixel context. One user can create multiple workspaces; other users register their own. Switch workspaces under Accounts or the workspace selector. Ownership is checked on the server for media, projects, versions, offers, plans, campaigns and approvals. The browser's workspace header prevents old tabs from silently writing into a newly selected client context.

The original Wayup integration is only the initial workspace. `.env` holds database, queue, encryption and storage infrastructure configuration plus initial bootstrap inputs. The runtime uses the selected workspace's encrypted Meta/AI integrations. A new live workspace without an AI key returns `AI_NOT_CONFIGURED`; it cannot consume another client's key.

Stored keys/tokens/app secrets never appear in overview responses. Blank password-style input fields do not reveal saved secrets. Application administrators can configure their own credentials; the current release does not implement a full Meta OAuth onboarding flow, app review, multi-workspace invitations or account recovery.

## Research contract

Reports compare exactly the countries in the current brief and store the brief revision/hash, report hash, instruction, parent version and human review decision. Concurrent updates cannot replace an unnoticed newer result. Mongo transactions and a unique `(projectId, number)` index enforce report history integrity.

AI comparisons are qualitative hypotheses, not measured demand or certified country rankings. Unknown CPC, conversion rates and regional opportunity scores remain unknown. The active OpenAI Luna High connection retrieves live web citations and stores actual retrieval status. Gemini Google Search is an optional alternative with its own quota. Retrieved competitor prices need source/date and product-comparability review. Supply dated buyer evidence and approve only after reviewing assumptions and country-specific evidence gaps.

Physical-product research can compare countries, but its automated purchase-cost/COD campaign workflow remains Bangladesh-specific. Service/software campaign drafts support the selected international test country. Website leads and purchases are implemented; instant forms, WhatsApp, registration goals, subscription LTV/churn, actual qualified-lead/sales ingestion and other ad platforms are outside this implementation. Lead insights keep revenue unknown. Each market/account still needs controlled Meta acceptance, including applicable disclosures and regulated-category requirements, before paid rollout.

## Private upload storage

| Item           | Implemented behavior                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| Images         | JPEG, PNG, WebP; maximum 10 MB                                                                                   |
| Videos         | MP4, WebM; maximum 50 MB; an uploaded image cover is required for a video ad                                     |
| Validation     | Actual file signatures, size checks, generated keys, SHA-256 immutable snapshots                                 |
| Quota          | 2 GB per workspace, transactionally reserved                                                                     |
| Access         | Authenticated workspace-owned `/api/media/:id/content`; no public object URL                                     |
| Video playback | Protected byte-range responses                                                                                   |
| Local backend  | Currently `.data/uploads`; private generated workspace/asset keys                                                |
| Hosted backend | Private S3-compatible adapter; actual cloud bucket not provisioned yet                                           |
| Meta upload    | Approved image bytes go to ad images; approved video bytes go to ad videos; returned IDs/hashes are checkpointed |
| Failure        | A video that is not ready cannot activate a creative graph; partial remote results require reconciliation        |

Uploads are campaign assets, not arbitrary user documents. Original filenames are display metadata, never storage paths. Files are not published as public static assets. Media deletion/retention automation and transcoding are not supplied; schedule storage lifecycle/retention and quotas for your deployment. Changing the storage driver does not migrate existing objects automatically.

For a single persistent server, mount a private writable directory and set:

```dotenv
STORAGE_DRIVER=local
STORAGE_PATH=/srv/adpilot/uploads
STORAGE_PERSISTENT=true
```

For AWS S3, Cloudflare R2 or another S3-compatible private bucket:

```dotenv
STORAGE_DRIVER=s3
S3_BUCKET=your-private-bucket
S3_REGION=your-bucket-region
S3_ENDPOINT=https://your-s3-compatible-endpoint
S3_ACCESS_KEY_ID=server-only-access-key
S3_SECRET_ACCESS_KEY=server-only-secret
```

Leave `S3_ENDPOINT` empty for AWS's standard regional endpoint. Use your actual bucket region for AWS and `auto` for R2. Provision a private bucket and scope the credentials to that bucket's get/put/delete operations. Configure HTTPS and keep public bucket access disabled. The app proxies signed reads through its authenticated API, so bucket credentials and URLs do not go to browsers. API and worker must use the same bucket or persistent volume. With Docker, the mounted directory must be writable by the container's `node` user. Production rejects local storage without `STORAGE_PERSISTENT=true`.

Back up MongoDB metadata, media objects and the token-encryption key together. Restoring Mongo without its assets/key cannot restore usable approved creatives/integrations. Multi-instance deployment should use S3 or a shared persistent volume, not separate instance disks.

See [the easy-use, Bangla and R2 guide](usability-and-storage.md) for the updated product/research flow, draft preservation and account ID help.

## Current live setup

The application is live at `https://fahimstack.tech/adpilot/`, with Atlas, the verified Meta connection, private Cloudflare R2, authenticated native Redis and BullMQ worker/schedulers. The active workspace uses OpenAI GPT-6 Luna High research reasoning and live web search. Private administrator details are in `.data/initial-admin.txt`. Paid execution is configured but requires the exact campaign's separate approval; no real paid advertisement was launched during setup or verification. See the current deployment and verification records.

Backend tests exercise isolation, stale tabs, private file ranges, research version/approval invalidation, Mongo concurrency, S3 signed requests and Meta image/video request behavior. Browser tests exercise actual image/video upload, repeat research, decision editing/approval, service campaign revision and separate demo launch approval on desktop/mobile. Cloud S3 upload and live paid Meta video/country acceptance remain external checks.

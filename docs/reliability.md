# Reliability and operational controls

This release implements monitoring, recovery, AI admission controls, queued research, bounded dashboard reads, evidence auditing, read-only campaign reconciliation and deployment testing. Account recovery, email verification, MFA and invitation security are intentionally excluded at the owner's request. Subscription billing remains excluded.

## Operations dashboard

Settings includes **System health & AI usage**. `/api/health` probes Mongo and Redis outside the ingress rate limiter; `/api/ready` additionally requires a recent worker heartbeat. Neither endpoint exposes credentials. Workers renew a 90-second heartbeat every 20 seconds and Docker checks it. The authenticated operations panel shows dependency failures, queue counts, recently failed jobs, backup freshness, restore verification, API error count and p95 request duration over a bounded 15-minute sample. Alerts remain inside the app; no email, Slack or external messages are sent.

Request IDs accompany responses and structured server error logs without request bodies or access tokens. The API drains requests on shutdown. Worker deployments allow in-flight jobs to finish; BullMQ can recover stalled processing. Health is dependency readiness, not a promise about Meta/AI availability or marketing outcomes.

## AI usage policy

Workspace administrators can configure daily/monthly logical AI requests, monthly token allowance, per-response output ceiling, optional USD planning allowance and due-product refresh interval. Defaults are 20 requests/day, 300/month, 2,000,000 tokens/month, 24,000 output tokens per response and automatic refresh OFF. Output ceilings include reasoning tokens. Models and high research reasoning are preserved.

Admission reservations are serialized using Mongo transactions and a workspace counter. Matching cached reports bypass the meter. Native OpenAI/Gemini usage is retained per generation, including input/output/reasoning tokens and reported search calls. Partial failures retain a conservative reservation because a timeout does not establish that the provider billed nothing. Three transient failures open a one-minute workspace cooldown. Gateway providers that omit usage retain estimated reservations.

Request counts and output ceilings are enforced. Token and USD admission allowances use conservative estimates; they are **not exact provider billing caps**, particularly for hidden tool input, images, retries, cached input discounts and unreported charges. USD control requires all applicable rates and remains optional when prices are unknown. Use the highest rate across configured models. Provider billing is authoritative; usage recording begins with this release and does not reconstruct historical invoices.

## Background research

Live physical-product plan creation and research-brief runs return a queued job immediately. The requesting user, tenant, language and input snapshot are stored. Duplicate requests reuse an active job. Workers reject changed/deleted targets and revoked membership, recover already-saved results by job ID, and never launch ads. OpenAI evidence collection checkpoints can be reused on retry; completed research caches also prevent repeated work. A completed result returns to the selected brief. Failed jobs offer **Retry with current inputs**. Demo mode still executes synchronously without provider charges.

Automatic paid daily refresh is no longer unconditional. It requires workspace opt-in, refreshes only due products, applies the normal AI allowance and schedules at most ten products per daily maintenance pass. Changing evidence or product inputs still requires fresh report review and separate campaign approval.

## Data performance and evidence

The frontend requests compact overview pages of 50 records per dataset, with a cursor and total count. **Load earlier records** fetches subsequent pages for products, plans, approvals, campaign performance, optimization and research records. API list queries enforce a maximum of 100 records and tenant-scoped cursors. Audit/launch-check summaries are bounded; performance totals are computed in Mongo without downloading full historical performance. Missing revenue stays unknown. Full compatibility overview remains available for API consumers. Detail/research endpoints still return the requested report/history; these should receive further pagination if individual histories become unusually large.

Research reports include source/date/owner-verification classification per claim, stale/future-date flags, counter-evidence and decision-review triggers. Confidence separates market evidence, product comparability and recorded performance. The existing combined threshold remains a product rule, not statistical confidence or independently audited profit. No historical approved report is rewritten.

Ad control center can compare linked manual/API campaigns with approved settings using only Meta reads. It reports mismatched settings, account mismatch, permission failures and unknown tracking/media details. Reading differences never changes a budget, resumes ads or approves a new action. Existing uncertain executions retain their reconciliation gate; this check does not automatically clear it.

## Offsite backup and restore drill

`node src/modules/operations/backup.js` snapshots all registered Mongo collections, indexes, ready media bytes and recovery credentials into an AES-256-GCM encrypted gzip archive in the private R2/S3 bucket under `system-backups/`. The separate `BACKUP_ENCRYPTION_KEY` must be preserved outside the VPS. The uploaded archive is downloaded, authenticated and verified before recording success. The latest 30 successful archives are retained. Archive media defaults to a 128 MiB admission ceiling to fit this VPS; exceeding it fails visibly rather than silently omitting media. Increase capacity or use a larger runner as storage grows.

Daily systemd backups run around 08:30 Asia/Dhaka (02:30 UTC, with up to five minutes jitter). Weekly restore drills run Sunday 09:00 Asia/Dhaka. `backup.js drill adpilot_restore_deployment` restores records and indexes into a new isolated database, verifies media checksums and decryptability of integration credentials, records success, and removes only that temporary database. Existing target databases and production names are rejected. A drill validates archived media bytes; it does not overwrite production R2 objects.

Keep the recovery key in private external storage. R2 remaining independent of the VPS protects against VPS loss; using the same R2 bucket for media and encrypted backups does not protect against deletion of the entire bucket/account. Operator retention and an additional independent copy can address that separate failure domain.

For actual recovery, `backup.js recover adpilot_restore_recovered` retains the newly restored isolated database, restores only missing media objects and refuses to overwrite conflicting objects. Recovered unfinished jobs become failed records requiring manual review/retry. It never repoints production automatically. Start an app with `LIVE_EXECUTION_ENABLED=false` against the recovered database, verify accounts, remote campaign outcomes and keys, then deliberately cut over. Keep provider/deployment access and the private recovery key outside the failed VPS.

## Staging and releases

`deploy/compose.staging.yaml` runs the release's UI/API on loopback port 4016 with demo adapters, no production credentials, and paid execution disabled. Staging data is ephemeral; it is deliberately separate from production records. Reach it through an SSH tunnel. Mongo replica-set behavior is tested independently by automated tests; demo staging does not represent live provider acceptance.

Startup migrations are additive and versioned in `schema_migrations`; existing approval hashes and encryption keys are preserved. Deployment prepares a new image/release, preserves the prior image and source, then switches the frontend symlink after health checks. The previous release remains available for rollback. CI checks syntax, backend tests, replica-set behavior, Redis integration, frontend build and dependency audit. Browser suites use separate server lifetimes to isolate rate-limit state. Workspace sections load lazily and render an actionable recovery panel if a section fails to load.

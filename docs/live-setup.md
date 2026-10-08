# Live setup and controlled acceptance

This runbook configures the live adapters. Local checks verified MongoDB, Meta reads and Gemini generation using supplied credentials. No advertising objects were created or activated. Private connection reports and administrator credentials are kept in the Git-ignored `.data` directory.

## 1. Infrastructure

Use a MongoDB replica set (Atlas or a properly secured self-hosted cluster), Redis, Node 22.12+, HTTPS termination, and a separate supervised worker process. Back up Mongo and test restoration before paid tests. Secrets belong in the deployment secret manager; `.env` is for local development and is ignored by Git.

For **local infrastructure only**, start Docker Desktop, then:

```powershell
docker compose up -d
```

This local-only compose file binds Mongo and Redis to loopback and initializes `rs0`. It has no production database authentication/TLS. Never expose its ports publicly or reuse it as a production deployment template. Mongo may advertise hostname `mongo`; for a host-side development client use `mongodb://localhost:27017/bd_ads?replicaSet=rs0&directConnection=true`.

## 2. Server configuration

Copy `.env.example` to `.env`. Set `APP_MODE=live`, correct Mongo/Redis endpoints and `APP_ORIGIN`. Generate two independent random keys:

The supplied local credentials are already in `.env`; preserve this file instead of overwriting it with the example. `BACKGROUND_JOBS_ENABLED=false` currently permits local planning without Redis and prevents paid execution. Obtain `REDIS_URL` from Upstash **Connect → TCP**, using its TLS connection string, then set `BACKGROUND_JOBS_ENABLED=true`. Upstash REST tokens and TCP passwords are different credentials; see [Upstash TCP connection troubleshooting](https://upstash.com/docs/redis/troubleshooting/no_auth) and [REST authentication](https://upstash.com/docs/redis/troubleshooting/http_unauthorized). Production always requires background jobs and Redis.

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one as `TOKEN_ENCRYPTION_KEY` (exactly 64 hex characters), the other as `MCP_SERVICE_KEY`. Store a key identifier/version and keep backups of the encryption key: losing it makes encrypted Meta tokens unrecoverable. Rotate by decrypting/re-encrypting under controlled maintenance; simply changing the key does not migrate ciphertext.

Set `META_API_VERSION` explicitly after checking the [Meta Graph API changelog](https://developers.facebook.com/docs/graph-api/changelog/). Set `LIVE_EXECUTION_ENABLED=false`. For a deployed HTTPS environment set `NODE_ENV=production`; configure `TRUST_PROXY` to the exact number of trusted reverse proxies. Secure cookies will not work over plain HTTP in production.

```powershell
npm ci
npm run build
npm start
```

In a separate terminal/process:

```powershell
npm run worker
```

The worker retries reads/research jobs, synchronizes historical performance, analyzes metrics, expires requests, and writes reports/reminders. It does not autonomously approve or mutate ads. Queue growth, stalled jobs and reconciliation-required campaigns need operational alerts.

Local connection and setup checks:

```powershell
npm run setup:check
npm run setup:bootstrap
npm run setup:gemini
node scripts/smoke-live.js
```

The Gemini check makes real provider calls and can incur provider charges. Bootstrap creates the initial Mongo administrator and encrypts a verified Meta integration, without creating campaigns. Its account/Page selection comes from `META_AD_ACCOUNT_ID` and `META_PAGE_ID`; it refuses ambiguous account selection. Browser verification uses the private administrator credential file and does not record password entry in traces.

## 3. Meta prerequisites

Create a Meta Developer business app and follow [Meta Marketing API setup](https://developers.facebook.com/docs/marketing-api/overview/). App review/access requirements depend on whether you manage only your own assets or other businesses; verify current Meta requirements. Configure least-privilege account/Page/pixel access and a managed token lifecycle. The adapter uses server-side bearer authorization; no access token is returned to the frontend.

The Bangladesh physical-product workflow requires a **BDT ad account**. Service/software plans also accept supported two-decimal account currencies; all costs, prices and budgets use that account's currency, with no automatic FX conversion. Supply the actual account, Page and pixel IDs and confirm the intended placement access/association. Each client configures its own encrypted Meta token/app secret and AI key under **Accounts**. An integration with existing campaigns cannot be rebound to a different account/Page/pixel; create another workspace.

The usable supplied token was the Graph Explorer user token. The separate Marketing token returned no accessible ad accounts. The usable token was exchanged server-side for a long-lived user token, stored privately, and verified against the supplied pixel's account. Its reported expiration is December 7, 2026. This token still needs lifecycle management; use a managed system-user token with the required asset assignments for an unattended deployment. `META_APP_SECRET` enables server-side `appsecret_proof`. The local default delivery region, Dhaka, has a verified Meta city key.

Use a dedicated account or reconcile externally created campaigns. App budget reservations cover app-managed campaigns only. Set appropriate Meta account spending controls before paid testing. Verify the current [campaign/ad-set fields in Meta's maintained SDK](https://github.com/facebook/facebook-python-business-sdk/tree/main/facebook_business/adobjects) for your chosen version, account, objective, and placement setup.

**Daily spending semantics:** the app's daily ceiling is a limit on the configured daily budget. Meta delivery may vary from the nominal amount. The API also sends a campaign spend cap and ad-set end time. Confirm supported spend-limit behavior, actual billing, minimum budgets and current daily delivery rules in your account. An exact hard per-calendar-day charge guarantee is not implemented and should not be promised to users.

## 4. Research and AI provider

Add dated manual observations and sourced competitor records. Native Gemini uses `LLM_PROVIDER=gemini`, `LLM_ENDPOINT=https://generativelanguage.googleapis.com/v1beta`, `LLM_API_KEY`, and `LLM_MODEL`. The local configuration uses `gemini-3.1-flash-lite`, which passed research and copy generation. The original 2.5 Flash model was rejected for this account, while newer Flash models returned capacity errors. The adapter sends its key only in the provider header, validates output against application Zod schemas, bounds retries for 429/503 responses, and rejects incomplete outputs. See [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output).

`GEMINI_SEARCH_GROUNDING=true` performs a separate Google Search retrieval before structured research and preserves actual returned reference URLs. It does not treat provider claims as verified evidence. Grounding is currently false because the supplied account returns quota errors for search. Enable the necessary billing/quota in Google AI Studio before retrying; see [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits). With grounding disabled, Gemini works from supplied facts and explicitly labeled assumptions. Demo mode always uses the demo AI adapter regardless of live credential settings.

The local bootstrap imports the initial workspace's AI configuration into encrypted Mongo integration storage. Other live workspaces must supply their own verified key/model in **Accounts**; they do not inherit the global bootstrap key. A trusted HTTPS gateway is also supported; the server must explicitly allow its hostname in `LLM_ALLOWED_GATEWAY_HOSTS` before users can save it. Provider selection is outside business services.

The gateway receives `POST {task,context,instructions}` with a bearer key. Return plain JSON matching `researchOutputSchema` or `copyOutputSchema` in `src/ai/provider.js`, or `comparisonSchema` in `src/modules/research/workbench.js`. Tasks are `bangladesh-market-research`, `market-comparison` and `campaign-copy`. The app has no hidden scraping or invented price feed. LLM output never self-certifies as verified; reviewed observations should enter the evidence inputs. Workspace gateway output cannot add arbitrary external source URLs.

Use request/response validation, allowed outbound hosts, provider timeout/budget controls and redacted logs at the gateway. Context includes business/product/evidence, not advertising or MCP credentials.

## 5. Controlled campaign acceptance

1. Confirm actual per-order cost, expected return loss, delivery coverage, inventory and profit target.
2. Add dated sources and a real HTTPS landing page and product image for each creative.
3. Resolve each selected Bangladesh city/region to a key returned by Meta; store it in Settings. Nationwide maps to country `BD` directly.
4. Generate a new plan after configuring the integration/locations. Old plan bindings are stale by design.
5. Validate pixel events and attributed purchase values against test orders. Unknown revenue must remain unknown; do not infer revenue from product price in the live adapter.
6. Review the plan and submit it. Confirm an analyst cannot approve/execute; an approver can.
7. Enable `LIVE_EXECUTION_ENABLED=true` only in the supervised controlled-test deployment. Restart the API. Choose a small test budget consistent with Meta minimums and the configured spend cap.
8. Approve and execute one reviewed plan. Inspect recorded IDs in Mongo and verify that created objects and activation match the snapshot in Ads Manager.
9. Sync insights, confirm daily records and purchase aliases aren't duplicated, then compare CPA against sustainable economics.
10. Request and approve a pause. Verify remote status and audit trail. Repeat execution of the same completed request must not create new objects.
11. Test a controlled budget request below the ceiling; verify that the total campaign spend cap remains unchanged.

## 6. Failure and reconciliation

If a Meta write fails or its HTTP result is lost, the approval/campaign becomes `needs_reconciliation`; partial object IDs remain in `campaigns.steps`, budget remains reserved, and the approval cannot be replayed. Do not convert its state back to approved as a quick retry.

If the API crashes between execution and checkpoint/finalization, an approval can remain `executing`. Maintenance flags long-running executions for reconciliation. Verify all remote IDs and activity first. Safely pause remote objects in Ads Manager with an authorized human, document the action/actual spend, and record an audited recovery decision using an operator maintenance script/transaction. The automated application does not guess whether a remote write happened. An admin recovery UI for partially provisioned object graphs is not included.

Monitor failure codes without logging access tokens. The adapter normalizes Meta codes/subcodes/trace IDs rather than returning raw provider errors. Reads have bounded retry/backoff; writes do not.

## Deployment hardening

For private uploads, configure a persistent local volume (`STORAGE_DRIVER=local`, `STORAGE_PATH`, `STORAGE_PERSISTENT=true`) or a private S3-compatible bucket (`STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_ENDPOINT`). Use `us-east-1` or the bucket's actual AWS region for AWS S3; R2 commonly uses `auto` with its account endpoint. Bucket credentials are server infrastructure secrets, not browser/user keys. A private Cloudflare R2 bucket is configured and enabled in this workspace. Real signed write/read/range/delete and authenticated API upload/download/range/privacy checks passed. No public bucket URL or public-access setting is required. `R2_PUBLIC_URL_TTL_SECONDS` does not apply to these authenticated proxy URLs. See [the storage and workflow runbook](workspaces-media-research.md). Configure the worker with the same storage backend and mounted volume/bucket.

Use authenticated/TLS databases, distributed ingress rate limiting, scoped Mongo application roles, external immutable audit retention, monitoring/alerts, data retention/backup policies, token rotation/expiry procedures, and appropriate user account recovery/MFA before expanding beyond a controlled pilot. Review schema migrations and load/capacity tests for expected traffic. The Docker image runs the API as a non-root user; deploy the same image with `node src/workers/index.js` for the worker.

Reference behavior: [Mongoose transactions](https://mongoosejs.com/docs/transactions.html), [BullMQ job schedulers](https://docs.bullmq.io/guide/job-schedulers/), [MCP SDK server transport](https://ts.sdk.modelcontextprotocol.io/server).

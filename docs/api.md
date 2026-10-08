# API reference

Base path `/api`. Responses are JSON; errors are `{ "error": { "code", "message", "details"? } }`. Same-site sessions use an HTTP-only cookie. Mutating browser/API-client requests must include the exact configured `Origin` header and JSON content type, except the multipart media upload. The browser sends `X-Workspace-Id`; a mismatch with its current session fails with 409 `WORKSPACE_CHANGED`, preventing stale tabs from writing to another workspace. There is no browser-visible bearer Meta token or stored AI key.

Responses echo a validated or generated `X-Request-Id`. Research run requests accept `Accept-Language: bn` to request new human-readable analysis in Bangla; country codes and JSON field names remain unchanged. Overview includes workspace `researchProjects` and storage driver/ready-file count without object keys or storage credentials.

`POST /research/versions/:id/product-campaign` with `{}` creates a Bangladesh product plan from a current approved physical-product report. Its brief must contain an owned `productId` and its approved recommendation must select `BD`. The resulting plan retains project/version/hash bindings; subsequent brief edits or research invalidate that decision before launch.

Product input additionally accepts optional `paymentMethod` (`cod`, `prepaid`, `mixed`), `deliveryRegions`, `mediaAssetId`, and video `thumbnailAssetId`. The UI takes return rate and margin as percentages and converts them to fractions before submitting. Delivery regions must remain inside workspace/product coverage when validating campaign targeting.

For `POST /integrations/meta`, empty/omitted `accessToken` re-verifies an existing encrypted connection belonging to this workspace. An unconnected workspace must provide a token. Empty token/secret preserves its saved secret; a new token without an app secret clears the previous proof secret. Field-specific errors are returned as `details.fieldErrors`.

| Method     | Route                                            | Behavior                                                                                       |
| ---------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| GET        | `/health`                                        | Mode and execution readiness, no secrets                                                       |
| POST       | `/auth/register`                                 | Name, email, password (12+ chars), businessName; creates isolated workspace                    |
| POST       | `/auth/login`                                    | Email/password and session cookie                                                              |
| POST       | `/auth/demo`                                     | Demo-only seeded workspace login                                                               |
| POST       | `/auth/logout`                                   | Revoke session and clear cookie                                                                |
| GET        | `/auth/me`                                       | Public identity / role                                                                         |
| GET        | `/overview`                                      | Tenant-scoped dashboard data and sanitized integration                                         |
| PUT        | `/business`                                      | Administrator business/delivery/budget policy                                                  |
| POST       | `/products`                                      | Strict product/cost input                                                                      |
| PUT        | `/products/:id`                                  | Product revision with preserved cost history                                                   |
| GET / POST | `/products/:id/evidence`                         | Dated, sourced market evidence                                                                 |
| POST       | `/products/:id/competitors`                      | Sourced competitor observation                                                                 |
| POST       | `/products/:id/plans`                            | Generate a new plan; body `{}`                                                                 |
| GET        | `/plans/:id`                                     | Complete plan, validation and reasons                                                          |
| POST       | `/plans/:id/revisions`                           | Override price/budget/duration/regions/ages/copy; new version                                  |
| POST       | `/plans/:id/submit`                              | Validate and request approval; body `{}`                                                       |
| POST       | `/approvals/:id/decision`                        | `{decision:"approve"                                                                           | "reject",comment}`; admin/approver |
| POST       | `/approvals/:id/execute`                         | Execute exact approved action through MCP; body `{}`; admin/approver                           |
| POST       | `/campaigns/:id/actions`                         | Propose pause/resume/budget/targeting/creative changes, with payload and reason                |
| POST       | `/campaigns/:id/sync`                            | Demo sync or BullMQ enqueue; body `{}`                                                         |
| POST       | `/campaigns/:id/analyze`                         | Purchase-based recommendations; body `{}`                                                      |
| POST       | `/optimizations/:id/request-approval`            | Approval request for proposed action; body `{}`                                                |
| POST       | `/integrations/meta`                             | Admin-only server token encryption and account/Page/pixel verification                         |
| GET        | `/integrations/meta/targeting?q=Dhaka&type=city` | Real Bangladesh Meta location search                                                           |
| POST       | `/integrations/meta/locations`                   | Verify and store `{name,key,type}`                                                             |
| GET / POST | `/users`                                         | Admin-only team list/create, analyst/approver roles                                            |
| GET / POST | `/workspaces`                                    | List memberships / create `{name}` with an isolated administrator membership                   |
| POST       | `/workspaces/switch`                             | `{businessId}`; verify membership and change authenticated session context                     |
| POST       | `/integrations/ai`                               | Administrator: `{provider,apiKey,model,grounding,endpoint?}`; verify and encrypt workspace key |
| GET / POST | `/media`                                         | Private asset list / multipart one `file`; real signature/type validation and workspace quota  |
| GET        | `/media/:id/content`                             | Authenticated owned media stream; supports byte ranges for video; no public file URLs          |
| GET        | `/research/countries`                            | Country catalog for candidate selection                                                        |
| GET / POST | `/research`                                      | Workspace projects / create validated product, service or software brief                       |
| PUT        | `/research/:id`                                  | Update brief revision and invalidate previous decision                                         |
| GET        | `/research/:id/versions`                         | Immutable report history with review status                                                    |
| POST       | `/research/:id/run`                              | `{instruction}`; follow-up research using current brief and previous report                    |
| POST       | `/research/versions/:id/edit`                    | `{summary,recommendation,note,countries?}`; create next report version                         |
| POST       | `/research/versions/:id/submit`                  | Submit current version with a selected candidate country                                       |
| POST       | `/research/versions/:id/decision`                | Administrator/approver `{decision,comment}`; approve/reject current report                     |
| POST       | `/research/versions/:id/campaign`                | Approved service/software report to campaign draft; separate launch approval required          |

Mutation MCP tools: `create_campaign`, `pause_campaign`, `resume_campaign`, `update_budget`, `update_ad_set` (targeting), `update_ad` (creative); each accepts only `{approvalId}`. Read tools: `get_campaign_insights`, `get_ad_set_insights`, `get_ad_insights`, each `{campaignId}`. Compound create includes ad-set/ad/creative creation and checkpointing inside the approved scope. Tools cannot accept arbitrary low-level writes; supported mutation payloads are loaded from the stored approval.

Internal routes `/internal/mcp/action` and `/internal/mcp/insights` require a strong service bearer key, separately from user sessions. Treat this key as privileged infrastructure access. Do not connect an untrusted or public agent to it.

## Product input example

```json
{
  "name": "Canvas Tote",
  "category": "Accessories",
  "description": "A reusable cotton canvas tote with reinforced handles.",
  "costs": {
    "product": 500,
    "packaging": 45,
    "delivery": 80,
    "paymentFixed": 20,
    "paymentPercent": 1,
    "other": 25,
    "returnRate": 0.1,
    "returnCost": 160
  },
  "inventory": 250,
  "minProfit": 200,
  "desiredMargin": 0.2,
  "sellingPrice": 1490,
  "landingUrl": "",
  "imageUrl": "",
  "dailyBudgetCeiling": 1500,
  "testBudgetCeiling": 10500
}
```

`desiredMargin` and `returnRate` use fractions; `paymentPercent` uses a percentage. `returnCost` is the net loss of an unsuccessful order, not the sale price. Live plans require an actual HTTPS landing page and an uploaded image/video or HTTPS creative image URL. Creative revisions accept `mediaAssetId` and optional video `thumbnailAssetId`; the server binds the owned assets' types and checksums.

For an optional sourced regional scoring component, an evidence entry can include numeric `value` (0–100) and `subject` such as `Dhaka:demand` or `Dhaka:fulfillment`. All nine component keys in `physicalProductWeights` must have dated evidence less than 30 days old before a score is emitted. The report stores each component's source and higher physical-product fulfillment/COD-risk weights. This is an evidence audit mechanism, not automated certification of the scores.

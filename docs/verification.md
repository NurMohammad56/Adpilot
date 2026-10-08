# Verification record

Validated on 8 October 2026 in the supplied Windows workspace, Node 22.17.0.

| Check                                                  | Result                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| JavaScript syntax                                      | Passed                                                                                                    |
| Node economics/service/API/security/MCP/provider tests | 50 passed, including research, workspace isolation, private uploads and signed S3 requests                |
| Mongo replica-set integration                          | Passed using an isolated real MongoDB 7.0.24 replica set                                                  |
| Browser desktop and mobile workflows                   | 4 passed, including actual image/video uploads, iterative research and separate service/product approvals |
| Real Redis/BullMQ integration                          | Previously passed against isolated local Redis 5.0.14.1; test instance shut down                          |
| Dependency audit                                       | 0 vulnerabilities                                                                                         |
| Vite production build                                  | Passed                                                                                                    |
| Live MongoDB Atlas                                     | Authentication, replica-set capability, initial administrator registration and integration writes passed  |
| Live Meta reads                                        | Active BDT account, Page, supplied pixel and Dhaka city lookup passed                                     |
| Meta token lifecycle                                   | Exchange passed; expiration December 7, 2026; token encrypted in Mongo                                    |
| Native Gemini                                          | Copy and market research passed with Gemini 3.1 Flash Lite; three copy languages validated                |
| Native Gemini international research                   | Passed structured service comparison for Bangladesh, United States and United Kingdom                     |
| Workspace-scoped live credentials                      | Initial Meta app secret and AI key encrypted in Mongo; new workspaces do not inherit provider credentials |
| Private local media                                    | File signature validation, workspace ownership, byte ranges and checksum checks passed                    |
| S3-compatible adapter                                  | Signed PUT/GET/range/DELETE wire test passed; no live cloud bucket configured                             |
| Meta image/video adapter                               | Mocked upload/country/event/cover/checkpoint requests passed; video failure blocks activation             |
| Gemini Google Search                                   | Supplied account returned quota errors; disabled locally                                                  |
| Upstash REST                                           | Authentication and PING passed; REST cannot run BullMQ                                                    |
| Upstash TCP/TLS                                        | Pending REDIS_URL; background jobs explicitly disabled                                                    |
| Local live browser login                               | Passed; Accounts/Media/Research UI and APIs checked; public responses contain no supplied secrets         |
| Paid Meta actions                                      | Not performed; LIVE_EXECUTION_ENABLED=false                                                               |
| Public deployment                                      | Pending hosting/provider/domain details                                                                   |
| Docker                                                 | Manifest parsed earlier; daemon unavailable, container startup not executed                               |

Regression tests use isolated fixtures and mock provider credentials. Explicit operator smoke checks use the configured live providers. Gemini calls can incur provider charges; no advertising writes were attempted.

Redis 5 is below BullMQ's recommended live minimum. Use Redis 6.2+ for deployment; Compose and CI use Redis 7.4. CI has not run on a remote runner in this session. Configuration guards require background jobs/Redis for production or paid execution.

Private evidence is in the Git-ignored .data directory: connection-status.json, gemini-status.json, global-research-status.json, meta-token-status.json, live-status.json and live-workspace.png. Administrator credentials and local secrets are Git-ignored. Mongo isolation and simultaneous research-version writes also passed in the replica-set test; the older research result cannot overwrite a concurrently saved newer version.

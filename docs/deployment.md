# VPS deployment

The AdPilot release is live at `https://fahimstack.tech/adpilot/`. Atlas now allows the VPS IP `62.72.58.29/32`; production API, login and worker connectivity passed live verification. The existing domain homepage and other services retain their routes.

## Layout and services

- Release source: `/srv/adpilot/releases/20261008-adpilot`.
- Runtime secrets: `/srv/adpilot/shared/production.env`, root-only file inside a private directory. Secrets are excluded from release archives and images.
- Compose definition: `deploy/compose.production.yaml`. API listens on loopback port 4015; worker runs separately. API and worker use the same encrypted Atlas records and private R2 bucket.
- Authenticated Redis 7.4 uses a private Docker network, AOF persistence and a persistent `/srv/adpilot/shared/redis` volume. It has no public port. BullMQ uses its native connection, independently of the earlier Upstash REST configuration.
- Nginx snippet: `/etc/nginx/snippets/adpilot.conf`. It serves the production frontend directly from the release's `public` directory and strips `/adpilot/` before proxying internal API paths. Static pages remain available during API restarts; API connection failures return a clear JSON 503. Application error details are preserved. A backup of the original domain config is kept in `/srv/adpilot/shared/backups`.
- Frontend build and runtime both use `APP_BASE_PATH=/adpilot`. `APP_ORIGIN=https://fahimstack.tech` contains the scheme and host only. Secure session cookies are scoped to `/adpilot/`.

## Start and inspect

```sh
cd /srv/adpilot/releases/20261008-adpilot
docker compose -f deploy/compose.production.yaml up -d --wait --wait-timeout 180
docker compose -f deploy/compose.production.yaml ps
docker compose -f deploy/compose.production.yaml logs --tail 40 api worker
curl --fail https://fahimstack.tech/adpilot/api/health
```

The API must be healthy before the worker starts. Containers restart after host restarts. Atlas must be reachable for login and transaction-safe operations. Do not disable TLS verification to work around an Atlas access-list failure.

## Research and campaign operation

Research defaults to `gemini-3.8-flash` with High thinking, separately from the copy model. Existing workspaces can override these defaults through **Accounts**. The adapter preserves the selected model across bounded retries; provider overload or quota exhaustion does not silently downgrade it. Gemini 3.8 research uses JSON mode with the full application schema in the prompt, strict validation and one bounded format repair. Unknown action fields fail validation. Source provenance remains application-owned; AI claims cannot certify themselves as verified evidence.

Google Search grounding is optional and remains disabled. The replacement key returned valid native Flash Lite JSON, but Gemini 3.8 High thinking returned Google's high-demand 503 for both the complete 10-country brief and a small independent request. Full research acceptance must be repeated when the selected model has capacity. Billing or another key is not a guaranteed fix for model overload. High thinking does not turn an unsourced hypothesis into verified market data. Add dated evidence and check the current search quota before enabling grounding.

Existing workspaces use their encrypted **Accounts** key. Changing server or local `LLM_API_KEY` does not replace it. Save the new key in the intended workspace's Accounts form; an empty key field deliberately preserves the saved key. The replacement key was saved through the authenticated production API during live verification.

Production enables paid execution and background jobs. A user still needs to supply complete economics, country, conversion event, private media and budget, review the plan, submit it, and approve the exact launch version. Live checks passed private media, real Meta reads, service draft generation, validation, submission, rejection, separate approval and the MCP approval gate. Campaign checks used an explicitly marked manual report fixture while the research model was unavailable; all test records were removed. Initial installation and verification do not launch or charge a real advertising campaign. Actual Meta paid acceptance remains untested.

## Updating and recovery

Prepare a new timestamped release, verify tests, and build its image before switching services. Retain the previous image tag and release directory. Use the existing secrets file and persistent Redis volume; keep `TOKEN_ENCRYPTION_KEY` unchanged so existing encrypted integrations remain readable. Check Atlas backups and R2 retention before a release that changes data formats. Restore the saved domain config and reload Nginx if a route change fails validation. Never stop unrelated Docker projects or overwrite the domain homepage.

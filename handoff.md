# Handoff

## Goal
A fully operational MS Teams bot (RGMC IT Bot) deployed on Google Cloud Run that:
- Sends real-time ticket notifications to registered Teams channels when tickets are created/updated in the RGMC ticketing system (Supabase)
- Allows channels to self-register with a code (`register <CODE>`)
- Allows users to query ticket status by number (`ticket <NUMBER>`)
- Allows users to ask IT-related questions answered by ChatGPT (`ask <QUESTION>`)
- Allows users to check if a site is up (`gumagana po ba yung <SITE>`) — pings via gateway
- Allows users to get a system's URL (`anong site po yung <SYSTEM>`) — shows primary/backup URLs
- Has a playful Taglish personality with randomized error responses
- Exposes webhook endpoints for the `rgmc-gateway` project to call when tickets change
- Has a `/health` endpoint that checks bot credentials + Supabase connectivity

**Deployed URL:** `https://rgmc-it-bot-935246372408.asia-southeast1.run.app`
**Gateway URL:** `https://rgmc-gateway-935246372408.asia-southeast1.run.app`
**Bot App ID (Entra/manifest):** `32374f3f-e2a8-4bb0-98e9-047329bbb720`

---

## Current State

### rgmc-it-bot — needs redeployment

All code is fully implemented and TypeScript compiles clean. The latest commit (`cfc33c1`) has NOT been deployed to Cloud Run yet. The previously deployed revision was broken by the auth fix (`48a12cf`), which was then superseded by a deeper fix (`21fc020`). The current code should work — but needs a fresh `gcloud run deploy` to be live.

| Feature | Status |
|---|---|
| node-fetch shim (auth fix) | **Implemented, NOT deployed** — see `src/app.ts` lines 17–32 |
| `register / unregister / configure / status` | Implemented, not tested end-to-end |
| `ticket <NUMBER>` | Implemented, not tested end-to-end |
| `ask <QUESTION>` | Implemented (OpenAI streaming), not tested end-to-end |
| `gumagana po ba yung <SITE>` | Implemented — pings gateway, renders site status card |
| `anong site po yung <SYSTEM>` | Implemented — shows primary/backup URLs for a system |
| `help` command | Now renders as a styled Adaptive Card (not plain text) |
| Adaptive Card designs | All 4 cards redesigned: ticket created, ticket updated, ticket status, site status, site info, help |
| Bot personality (Taglish errors) | Implemented — `pick()` helper, randomized messages on every error |
| Cloud Run deployment | **NEEDS REDEPLOY** — last successful deploy predates the auth fix |

### Auth error (root cause found and fixed)

The bot was returning 401 on all `/api/messages` requests. Two-stage fix applied:

1. **First attempt** (`48a12cf`): passed native `fetch` as `customFetchImpl` 4th arg to `ConfigurationBotFrameworkAuthentication` — this was the WRONG code path. `JwtTokenExtractor` uses `OpenIdMetadata` which imports `node-fetch` directly and never touches `customFetchImpl`.

2. **Working fix** (`21fc020`): intercepts `require('node-fetch')` via `Module._load` override at the very top of `app.ts` module body, BEFORE `registerRoutes()` loads botbuilder. Returns `globalThis.fetch` (Node 22 native, undici-backed) instead of node-fetch v2. This fixes the `Premature close at Gunzip` error in `openIdMetadata.js` lines 83 and 86.

The shim prints `[shim] node-fetch → native fetch (Node 22)` to logs on startup — look for this after deploy to confirm it's active.

---

## Files Actively Being Edited

### rgmc-it-bot
- `src/app.ts` — Added `Module._load` shim at top of module body (lines 17–32) to replace node-fetch with native fetch before botbuilder loads. Also reverted the `customFetchImpl` workaround (no longer needed). Clean compile.
- `src/bot.ts` — Full rewrite this session: added `gumagana` command, `anong` command, `pick()` helper, `extractArg()` helper, `GUMAGANA_FILLERS` / `ANONG_FILLERS` sets. Playful Taglish error messages on all commands. Help now uses `buildHelpCard()` card. Default unknown-command case sends text first then card separately.
- `src/cards/ticketCard.ts` — Fully redesigned: bold bleed headers with large ticket numbers, priority color strips, 3-column info grids, status strip (colored by status), `fontType` improvements. All three functions redesigned.
- `src/cards/siteStatusCard.ts` — Fully redesigned: emphasis header + overall status strip, per-system rows with left (name/URL) and right (status/latency) columns, latency speed label (⚡🐇🐢), bleed rows.
- `src/cards/siteInfoCard.ts` — **New file.** Shows primary/backup URLs for a system. Single-system: full detail with action buttons. Multiple systems: stacked containers with separators, no buttons.
- `src/cards/helpCard.ts` — **New file.** Adaptive Card command reference: 4 color-coded sections (📢 CHANNEL=green, 🎫 TICKETS=amber, 🌐 SITES=blue, 💬 AI=red), monospace command names, subtle descriptions, footer tip.
- `src/services/pingService.ts` — **New file.** Calls `GET {GATEWAY_BASE_URL}/api/admin/systems/{id}/ping` with `X-Gateway-Username` header. Uses `AbortSignal.timeout(12000)`.
- `src/services/gptService.ts` — **New file** (from previous session). OpenAI streaming, lazy singleton client, returns full assembled string.
- `src/services/supabase.ts` — Added `findSystemsByTag(site)` — fetches all systems with non-null tags, filters in-process by exact tag match (comma-separated). Updated select to include `primary_label`, `backup_label`.
- `src/config.ts` — Added `gptApiKey`, `gptVersion`, `gptLimit`, `gatewayAdminUsername`.
- `src/types/index.ts` — Added `System` interface (with `primary_label`, `backup_label`), `PingResult` interface.
- `.env.example` — Added `GPT_API_KEY`, `GPT_VERSION`, `GPT_LIMIT`, `GATEWAY_ADMIN_USERNAME`.
- `Dockerfile` — Node 20 → Node 22 (both builder and runtime stages).
- `package.json` — Added `openai: ^6.44.0`.

---

## Failed Attempts

- **What was tried**: Passing native fetch as `customFetchImpl` (4th arg) to `ConfigurationBotFrameworkAuthentication` — **Why it failed**: This parameter only affects outbound connector HTTP calls. The inbound JWT validation path goes through `JwtTokenExtractor` → `OpenIdMetadata` → direct `require('node-fetch')` call. `customFetchImpl` is never forwarded there.

- **What was tried**: The original `FetchError: Premature close at Gunzip` fix using `customFetchImpl` alone — **Why it failed**: The gzip error disappeared (so the custom fetch was partially working for some paths), but `AuthenticationError: Signing Key could not be retrieved` remained because `openIdMetadata.js:83-86` still used node-fetch v2.

- **What was tried**: Node 20 in Dockerfile — **Why it failed**: Supabase Realtime client throws synchronously `"Node.js 20 detected without native WebSocket support"` at module load time, crashing the process before it can bind port 8080.

- **What was tried**: Top-level import of health route (`import { createHealthRouter }`) in `app.ts` — **Why it failed**: Eagerly loaded Supabase at module startup; if any env var was invalid, the process crashed before binding port 8080, causing Cloud Run startup probe failure.

- **What was tried**: Registering `/health` inside `registerRoutes()` try/catch — **Why it failed**: If bot credentials failed, the whole `registerRoutes()` threw and health was never registered, returning `Cannot GET /health`.

---

## Next Step

**Deploy the bot to Cloud Run.** All code is ready and compiles clean. Run from `C:\claude\rgmc-it-bot`:

```
gcloud run deploy rgmc-it-bot --source . --region asia-southeast1
```

Then set any missing env vars (if not already set on the Cloud Run service):
```
gcloud run services update rgmc-it-bot --region asia-southeast1 \
  --set-env-vars GPT_API_KEY=<openai-key>,GPT_VERSION=gpt-4o,GPT_LIMIT=1000,GATEWAY_ADMIN_USERNAME=<admin-username>
```

After deploy:
1. Check logs for `[shim] node-fetch → native fetch (Node 22)` — confirms the auth fix is active
2. Hit `/health` — both `bot_credentials` and `supabase` should be `"ok"`
3. In Teams, test `@RGMC IT Bot help` — should render the styled Adaptive Card
4. Test `@RGMC IT Bot gumagana po ba yung <tag>` with a known tag from the systems table
5. Test `@RGMC IT Bot anong site po yung <tag>` with the same tag

---

## Context & Gotchas

- **No `.env` file** in `C:\claude\rgmc-it-bot\`. All env vars must be set in Cloud Run directly. Only `.env.example` exists.
- **`GATEWAY_ADMIN_USERNAME`** must be a username that has `is_admin = true` in the gateway's `users` table. The ping endpoint (`GET /api/admin/systems/<id>/ping`) uses `X-Gateway-Username` header for auth.
- **`tags` column in `systems` table** is plain text, comma-separated (e.g. `"payroll,hr"`). The bot fetches all systems with non-null tags and filters in-process. Matching is case-insensitive exact match against each tag token.
- **Bot manifest ID** (`32374f3f-e2a8-4bb0-98e9-047329bbb720`) must exactly match `BOT_ID` env var in Cloud Run.
- **Azure Bot messaging endpoint** must be `https://rgmc-it-bot-935246372408.asia-southeast1.run.app/api/messages` — the `/api/messages` path is required.
- **The `gumagana` command** strips leading filler words `po`, `ba`, `yung` and trailing `?`. The `anong` command strips `site`, `po`, `yung` and trailing `?`. Both use `extractArg()` in `bot.ts:23–27`.
- **`src/routes/health.ts`** still exists as a dead file — it was replaced by inline health logic in `app.ts`. Safe to ignore or delete.
- **Cloud Run sets `PORT=8080`** — app reads `process.env.PORT || '3978'`, works correctly.
- **Supabase table name** is `bot_subscriptions` (not `channel_subscriptions`).
- **Teams bot installation**: the bot must be explicitly installed into each Team via Apps before it can receive @mentions. Registering the manifest alone is not enough.
- **`ask` command is case-insensitive** — `text.toLowerCase().split()` is used, so `Ask` and `ASK` both work.
- **OpenAI streaming** is used in `gptService.ts` — full response is collected before sending to Teams, preventing Node.js request timeouts.
- **`anong site po yung`**: single-system result shows Open Primary / Open Backup action buttons; multiple systems show URL as text only (no buttons to avoid clutter).
- **Help card** (`helpCard.ts`) replaced the old `HELP_TEXT` string constant entirely. `buildHelpCard()` returns an `Attachment`. Unknown command case sends two activities: playful text first, then the card.
- **`rgmc-gateway` deep-link** (`GET /admin/issues/<id>`) requires admin login on the gateway — users clicking "View Ticket" must already be logged in as admin.

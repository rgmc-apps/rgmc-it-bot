# Handoff

## Goal
A fully operational MS Teams bot (RGMC IT Bot) deployed on Google Cloud Run that:
- Sends real-time ticket notifications to registered Teams channels when tickets are created/updated in the RGMC ticketing system (Supabase)
- Allows channels to self-register with a code (`register <CODE>`)
- Allows users to query ticket status by number (`ticket <NUMBER>`)
- Allows users to ask IT-related questions answered by ChatGPT (`ask <QUESTION>`)
- Allows users to check if a site is up (`gumagana po ba yung <SITE>`) — pings via gateway
- Allows users to get a system's URL (`anong site po yung <SYSTEM>`) — shows primary/backup URLs
- Allows users to confirm the bot is alive (`vibe check`) — randomized Taglish reply
- Has a playful Taglish personality with randomized error responses
- Exposes webhook endpoints for the `rgmc-gateway` project to call when tickets change
- Has a `/health` endpoint that checks bot credentials + Supabase connectivity

**Deployed URL:** `https://rgmc-it-bot-935246372408.asia-southeast1.run.app`
**Gateway URL:** `https://rgmc-gateway-935246372408.asia-southeast1.run.app`
**Bot App ID (Entra/manifest):** `32374f3f-e2a8-4bb0-98e9-047329bbb720`

---

## Current State

### rgmc-it-bot — needs redeployment

All code is fully implemented, committed, and TypeScript compiles clean. **The latest commits have NOT been deployed to Cloud Run yet.** The currently running Cloud Run revision is stale — it predates the auth fix, the vibe check command, and the GPT chunking fix. The bot will return 401 on `/api/messages` until redeployed.

Latest commits (all need to land on Cloud Run):
- `70277f3` — added gpt limiting (chunkText, raised max_tokens default to 4096)
- `c0a9559` — added vibe check command
- `cfc33c1` — modified dialogs
- `a6bb4e8` — added gumagana / anong site commands
- `48a12cf` — metadata fix
- `21fc020` — auth fix (node-fetch shim)

| Feature | Status |
|---|---|
| node-fetch shim (auth fix) | Committed, **NOT deployed** |
| `register / unregister / configure / status` | Implemented, not tested end-to-end |
| `ticket <NUMBER>` | Implemented, not tested end-to-end |
| `ask <QUESTION>` | Implemented — now chunks long responses, 4096 token default |
| `vibe check` | Implemented — 6 randomized Taglish alive-responses |
| `gumagana po ba yung <SITE>` | Implemented — pings gateway, renders site status card |
| `anong site po yung <SYSTEM>` | Implemented — shows primary/backup URLs for a system |
| `help` command | Renders styled Adaptive Card with all commands including vibe check |
| Adaptive Card designs | ticket created, ticket updated, ticket status, site status, site info, help |
| Bot personality (Taglish errors) | Implemented — `pick()` helper, randomized messages |
| Cloud Run deployment | **NEEDS REDEPLOY** |

### Auth error (root cause found and fixed)

The bot was returning 401 on all `/api/messages` requests. Working fix (`21fc020`): intercepts `require('node-fetch')` via `Module._load` override at the very top of `app.ts` module body, BEFORE `registerRoutes()` loads botbuilder. Returns `globalThis.fetch` (Node 22 native, undici-backed) instead of node-fetch v2. This fixes the `Premature close at Gunzip` error in `openIdMetadata.js`.

The shim prints `[shim] node-fetch → native fetch (Node 22)` to logs on startup — look for this after deploy to confirm it's active.

---

## Files Actively Being Edited

All changes this session are committed. No files are in a mid-edit state.

### Changes from this session:

- `src/bot.ts` — Added `vibe check` case (command=`vibe`, checks `args[0]==='check'`; 6 randomized Taglish alive replies). Added `chunkText()` helper (splits at newline → space → hard cut, ≤3800 chars per chunk). Updated `ask` case to use `chunkText()` — sends multiple messages labeled `(1/2)`, `(2/2)` etc. for long GPT answers.

- `src/cards/helpCard.ts` — Added new **🟢 GENERAL** section at the top of the command list with `vibe check` entry.

- `src/config.ts` — Raised default `GPT_LIMIT` from `1000` → `4096` tokens so GPT no longer gets cut off mid-answer.

### Files from previous sessions (for reference):

- `src/app.ts` — `Module._load` shim at lines 17–32 replaces node-fetch with native fetch before botbuilder loads.
- `src/cards/ticketCard.ts` — buildTicketCreatedCard, buildTicketUpdatedCard, buildTicketStatusCard
- `src/cards/siteStatusCard.ts` — buildSiteStatusCard (ping results with latency)
- `src/cards/siteInfoCard.ts` — buildSiteInfoCard (primary/backup URLs)
- `src/cards/helpCard.ts` — buildHelpCard (all commands, color-coded sections)
- `src/services/pingService.ts` — GET {GATEWAY_BASE_URL}/api/admin/systems/{id}/ping
- `src/services/gptService.ts` — OpenAI streaming, assembles full string before returning
- `src/services/supabase.ts` — findSystemsByTag (filters by comma-separated tags column)
- `src/config.ts` — gptApiKey, gptVersion, gptLimit, gatewayAdminUsername
- `src/types/index.ts` — System interface, PingResult interface
- `Dockerfile` — Node 22 (both builder and runtime stages)

---

## Failed Attempts

- **What was tried**: Passing native fetch as `customFetchImpl` (4th arg) to `ConfigurationBotFrameworkAuthentication` — **Why it failed**: This parameter only affects outbound connector HTTP calls. The inbound JWT validation path goes through `JwtTokenExtractor` → `OpenIdMetadata` → direct `require('node-fetch')` call. `customFetchImpl` is never forwarded there.

- **What was tried**: Node 20 in Dockerfile — **Why it failed**: Supabase Realtime client throws synchronously `"Node.js 20 detected without native WebSocket support"` at module load time, crashing the process before it can bind port 8080.

- **What was tried**: Top-level import of health route in `app.ts` — **Why it failed**: Eagerly loaded Supabase at module startup; if any env var was invalid, the process crashed before binding port 8080.

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
  --set-env-vars GPT_API_KEY=<openai-key>,GPT_VERSION=gpt-4o,GPT_LIMIT=4096,GATEWAY_ADMIN_USERNAME=<admin-username>
```

After deploy:
1. Check logs for `[shim] node-fetch → native fetch (Node 22)` — confirms the auth fix is active
2. Hit `/health` — both `bot_credentials` and `supabase` should be `"ok"`
3. In Teams, test `@RGMC IT Bot vibe check` — should get one of 6 randomized alive replies
4. In Teams, test `@RGMC IT Bot ask <long question>` — should get chunked messages if response is long
5. Test `@RGMC IT Bot gumagana po ba yung <tag>` with a known tag from the systems table
6. Test `@RGMC IT Bot help` — should show GENERAL section with vibe check at the top

---

## Context & Gotchas

- **No `.env` file** in `C:\claude\rgmc-it-bot\`. All env vars must be set in Cloud Run directly. Only `.env.example` exists.
- **`GATEWAY_ADMIN_USERNAME`** must be a username that has `is_admin = true` in the gateway's `users` table. The ping endpoint (`GET /api/admin/systems/<id>/ping`) uses `X-Gateway-Username` header for auth.
- **`tags` column in `systems` table** is plain text, comma-separated (e.g. `"payroll,hr"`). The bot fetches all systems with non-null tags and filters in-process. Matching is case-insensitive exact match against each tag token.
- **Bot manifest ID** (`32374f3f-e2a8-4bb0-98e9-047329bbb720`) must exactly match `BOT_ID` env var in Cloud Run.
- **Azure Bot messaging endpoint** must be `https://rgmc-it-bot-935246372408.asia-southeast1.run.app/api/messages`.
- **`vibe check` is two words** — command=`vibe`, args[0]=`check`. Typing just `vibe` returns a correction nudge. The switch `case 'vibe':` checks `args[0] !== 'check'` to handle the partial case.
- **`chunkText()` splits at** natural boundaries: tries last `\n` before 3800 chars, then last space, then hard cut. Chunks are labeled `*(1/2)*` etc. only when there are multiple chunks.
- **`GPT_LIMIT` default is now 4096** — was 1000 in old Cloud Run env vars; update it via `gcloud run services update` or the Cloud Run console to match.
- **`src/routes/health.ts`** still exists as a dead file — it was replaced by inline health logic in `app.ts`. Safe to ignore or delete.
- **Cloud Run sets `PORT=8080`** — app reads `process.env.PORT || '3978'`, works correctly.
- **Supabase table name** is `bot_subscriptions` (not `channel_subscriptions`).
- **Teams bot installation**: the bot must be explicitly installed into each Team via Apps before it can receive @mentions. Registering the manifest alone is not enough.
- **`ask` command is case-insensitive** — `text.toLowerCase().split()` is used.
- **`gumagana` strips** leading filler words `po`, `ba`, `yung` and trailing `?`. **`anong` strips** `site`, `po`, `yung` and trailing `?`. Both use `extractArg()` in `bot.ts`.
- **`anong site po yung`**: single-system result shows Open Primary / Open Backup action buttons; multiple systems show URL as text only.
- **`rgmc-gateway` deep-link** (`GET /admin/issues/<id>`) requires admin login — users clicking "View Ticket" must already be logged in as admin.

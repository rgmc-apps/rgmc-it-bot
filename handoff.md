# Handoff

## Goal
A fully operational MS Teams bot (RGMC IT Bot) deployed on Google Cloud Run that:
- Sends real-time ticket notifications to registered Teams channels when tickets are created/updated in the RGMC ticketing system (Supabase)
- Allows channels to self-register with a code (`register <CODE>`)
- Allows users to query ticket status by number (`ticket <NUMBER>`)
- Allows users to ask IT-related questions answered by ChatGPT (`ask <QUESTION>`)
- Exposes webhook endpoints for the `rgmc-gateway` project to call when tickets change
- Has a `/health` endpoint that checks bot credentials + Supabase connectivity
- "View Ticket" buttons in notification cards deep-link into the `rgmc-gateway` admin panel

**Deployed URL:** `https://rgmc-it-bot-935246372408.asia-southeast1.run.app`
**Gateway URL:** `https://rgmc-gateway-935246372408.asia-southeast1.run.app`
**Bot App ID (Entra/manifest):** `32374f3f-e2a8-4bb0-98e9-047329bbb720`

---

## Current State

### rgmc-it-bot (C:\claude\rgmc-it-bot)
| Feature | Status |
|---|---|
| Bot responds to @mentions | **Unconfirmed** — bot was not responding earlier; BOT_ID/BOT_PASSWORD confirmed correct but root cause not fully resolved |
| `/health` endpoint | Working — returns `bot_credentials` + `supabase` checks. Last confirmed degraded due to Supabase WebSocket (fixed by Node 22 upgrade) |
| `/ping` endpoint | Working — zero-dependency liveness check |
| `register / unregister` commands | Implemented, not tested end-to-end in Teams |
| `ticket <NUMBER>` command | Implemented, not tested end-to-end |
| `ask <QUESTION>` command | Implemented — uses OpenAI streaming, sends with `textFormat: 'markdown'`. Last known issue: response was cut at first line — fix applied (`msg.textFormat = 'markdown'`), **not yet confirmed working** |
| View Ticket card button | Fixed — URL was double-slash + `#id` fragment; now `${gatewayBaseUrl}/admin/issues/${ticket.id}` |
| Cloud Run deployment | Last successful deploy was broken (revision 00012 failed). Fix applied (Node 22, lazy health route imports). **Needs redeploy to confirm** |

### rgmc-gateway (C:\claude\rgmc-gateway)
| Feature | Status |
|---|---|
| `GET /admin/issues/<id>` route | **Added this session** — renders `admin.html` with `open_issue_id`, auto-opens issue modal via `window._OPEN_ISSUE_ID` |
| Deep-link auto-open modal | Implemented in `admin.js` — switches to Issues tab, loads all issues, opens modal. **Not yet deployed/tested** |

---

## Files Actively Being Edited

### rgmc-it-bot
- `src/app.ts` — Major restructure: `/ping` and `/health` registered before `app.listen()` using lazy `require()` inside handlers to avoid crashing at startup. `registerRoutes()` no longer registers health. Routes logged to console on startup.
- `src/routes/health.ts` — Now imports `{ db }` from supabase service and queries `bot_subscriptions`. Still exists but is no longer used (health logic was inlined into `app.ts`). Can be deleted or kept for reference.
- `src/services/supabase.ts` — `db` client changed from `const` to `export const` (line 6) so health check and other callers can import it directly.
- `src/services/gptService.ts` — **New file.** Lazy singleton OpenAI client. Uses `stream: true`, collects all chunks with `for await` before returning full string.
- `src/bot.ts` — Added `ask` command case (lines 111–127). `ask` sends response with `MessageFactory.text(answer)` + `msg.textFormat = 'markdown'`. Updated HELP_TEXT to include `ask` command.
- `src/config.ts` — Added `gptApiKey`, `gptVersion` (default `gpt-4o`), `gptLimit` (default `1000`) at lines 25–27.
- `src/cards/ticketCard.ts` — `viewTicketAction()` line 37: fixed URL from `${gatewayBaseUrl}/admin/issues#${ticket.id}` to `${gatewayBaseUrl.replace(/\/$/, '')}/admin/issues/${ticket.id}`.
- `.env.example` — Added OpenAI section with `GPT_API_KEY`, `GPT_VERSION`, `GPT_LIMIT`.
- `Dockerfile` — Upgraded from `node:20-alpine` to `node:22-alpine` (both builder and runtime stages) to fix Supabase WebSocket error.
- `package.json` — Added `openai: ^6.44.0` dependency; `@types/node` bumped to `^22.0.0`.

### rgmc-gateway
- `controllers/issues.py` — Added `render_template` import; added `GET /admin/issues/<issue_id>` route at lines 235–237.
- `templates/admin.html` — Added `{% if open_issue_id %}<script>window._OPEN_ISSUE_ID = {{ open_issue_id | tojson }};</script>{% endif %}` before `admin.js` script tag (lines 820–822).
- `static/admin.js` — Two changes:
  1. Line 156: On `DOMContentLoaded`, if `window._OPEN_ISSUE_ID` is set, calls `switchTab('issues')` instead of `loadRequests('pending')`.
  2. Lines 934–942: Inside `loadIssues()`, after `_issuesCache = all`, checks for `window._OPEN_ISSUE_ID`, switches status filter to `'all'`, then calls `openIssueModal(targetId)` via `setTimeout(..., 0)`.

---

## Failed Attempts

- **What was tried**: Adding `import { createHealthRouter } from './routes/health'` as a top-level import in `app.ts` — **Why it failed**: This eagerly loaded `supabase.ts` at module startup which called `createClient()` before `app.listen()`. On Cloud Run, if any env var was invalid/empty, the process crashed before binding to port 8080, causing the "container failed to start" error on revision 00012.

- **What was tried**: Registering `/health` inside `registerRoutes()` try/catch block — **Why it failed**: If anything inside `registerRoutes()` threw (e.g., bad bot credentials), the health route was never registered, returning `Cannot GET /health`.

- **What was tried**: Health check creating a new `createClient()` instance on each request — **Why it failed**: Supabase's Realtime client throws synchronously on Node.js 20 (`"Node.js 20 detected without native WebSocket support"`) because there's no native `WebSocket` global. The `catch` block captured it as an error.

- **What was tried**: Using `context.sendActivity(answer)` (plain string) for GPT response — **Why it failed**: Teams truncates plain text bot messages at the first newline. Response appeared cut at the first line.

- **What was tried**: View Ticket URL constructed as `${gatewayBaseUrl}/admin/issues#${ticket.id}` — **Why it failed**: Double slash when `gatewayBaseUrl` had trailing slash; `#` is a fragment anchor not a path, so the gateway received `/admin/issues` with no ID and returned 404.

---

## Next Step

**Deploy both projects and test the `ask` command end-to-end.**

1. Deploy `rgmc-it-bot` to Cloud Run:
   ```
   gcloud run deploy rgmc-it-bot --source . --region asia-southeast1
   ```
   Then set the three new Cloud Run env vars if not already set:
   - `GPT_API_KEY` = your OpenAI key
   - `GPT_VERSION` = `gpt-4o`
   - `GPT_LIMIT` = `1000`

2. Hit `https://rgmc-it-bot-935246372408.asia-southeast1.run.app/health` — both `bot_credentials` and `supabase` should be `"ok"`.

3. In Teams, @mention the bot and try: `@RGMC IT Bot ask what is a VPN?` — verify full multi-line response appears.

4. Deploy `rgmc-gateway` and test the View Ticket deep-link by clicking the button on a notification card.

5. If the bot still doesn't respond to @mentions after the health check passes, check Cloud Run logs for `POST /api/messages` hits. If no hits appear, the messaging endpoint in Azure Bot Service Configuration is wrong or the bot is not installed in the channel.

---

## Context & Gotchas

- **No `.env` file exists** in `C:\claude\rgmc-it-bot\`. All env vars must be set in Cloud Run environment variables directly. There is only a `.env.example`.
- **Manifest bot ID** (`32374f3f-e2a8-4bb0-98e9-047329bbb720`) must exactly match `BOT_ID` env var in Cloud Run. These were confirmed correct this session.
- **Azure Bot messaging endpoint** must be set to `https://rgmc-it-bot-935246372408.asia-southeast1.run.app/api/messages` — the full path including `/api/messages` is required.
- **`src/routes/health.ts`** still exists and exports `createHealthRouter` but is no longer imported anywhere. The actual health logic lives inline in `app.ts`. This file is dead code — safe to delete or ignore.
- **Cloud Run sets `PORT=8080`** — the app reads `process.env.PORT || '3978'` so this works correctly.
- **Supabase table name** is `bot_subscriptions` (not `channel_subscriptions` — an early mistake was using the wrong table name in the health check).
- **Teams bot installation**: the bot must be explicitly installed into each Team via Apps before it can receive @mentions. Publishing the manifest package alone is not enough.
- **`ask` command is case-sensitive** on the command extraction — `text.toLowerCase().split()` is used so `Ask` or `ASK` will not match. This is intentional per the existing pattern.
- **`rgmc-gateway` deep-link requires admin login**: `GET /admin/issues/<id>` renders `admin.html` which checks `localStorage` for a session with `isAdmin: true` and redirects to `/` if not found. Users clicking the card must already be logged in as admin on the gateway.
- **GPT_LIMIT default is 1000 tokens** — for complex IT questions this may still truncate the response. Consider increasing to 2000 in Cloud Run if responses feel cut short.
- **OpenAI streaming** is used in `gptService.ts` — this keeps the HTTP connection to OpenAI alive during generation and prevents Node.js request timeouts. The full response is collected before being sent to Teams.

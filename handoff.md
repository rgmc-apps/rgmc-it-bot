# Handoff

## Goal

Build and maintain the **RGMC IT Teams Bot** (`C:\claude\rgmc-it-bot`) — a Microsoft Teams bot registered on the RGMC Entra organization that:

- Notifies subscribed Teams channels when IT tickets are created or updated (pushed from `C:\claude\rgmc-gateway`)
- Lets users query ticket status, check site health, query GCP/MSSQL databases, and ask AI questions
- Supports both admin-code-based registration (`register <CODE>`) and self-service channel subscription (`subscribe`)
- Exposes webhook endpoints (`/api/notify/*`) that `rgmc-gateway` (Python/Flask) calls after ticket create/update events

End state: both projects deployed to Cloud Run, gateway configured with bot URL + API key, all Teams channels able to self-subscribe and receive real-time ticket alerts.

---

## Current State

### Bot (`C:\claude\rgmc-it-bot`) — ✅ Compiles clean, uncommitted changes this session

`npx tsc --noEmit` passes. Last git commit: `aa9b60d added connection changes`.

**Changes made this session (not yet committed):**
- `subscribe` command added — self-service channel subscription without admin codes
- `subscribeChannelDirect()` added to `supabase.ts` — inserts `bot_subscriptions` row with auto-generated `SUB-XXXXXXXX` code
- `subscribeChannel()` added to `channelService.ts` — orchestrates the subscription flow
- Help card updated with three new `subscribe` command entries

**All working bot commands:**
| Command | Function |
|---|---|
| `subscribe` | Self-service subscription (notify_created only) |
| `subscribe all` | Subscribe to created + updated + resolved |
| `subscribe created updated resolved` | Mix-and-match event types |
| `register <CODE>` | Admin-code-based registration (existing) |
| `unregister` | Remove subscription |
| `configure all / priority / type` | Filter notifications |
| `status` | Show current subscription config |
| `ticket <NUMBER>` | Look up ticket status |
| `gumagana po ba yung <SITE>` | Ping site |
| `anong site po yung <SYSTEM>` | Get site URL |
| `ask <QUESTION>` | GPT-powered AI assistant |
| `bigquery <table> <col> <val>` | Query BigQuery |
| `bigquery latest <table> <datecol>` | Latest BigQuery rows |
| `<db_name> <table> <col> <val>` | Generic MSSQL query |
| `vibe check` | Bot health check |

**Webhook endpoints (already existed, used by gateway):**
- `POST /api/notify/ticket-created` — `{ event: "ticket.created", ticket: Ticket }`
- `POST /api/notify/ticket-updated` — `{ event: "ticket.updated", ticket: Ticket, changes: TicketChanges }`
- `POST /api/notify` — unified endpoint, dispatches on `payload.event`
- All three require `x-api-key` header matching `WEBHOOK_API_KEY` env var

### Gateway (`C:\claude\rgmc-gateway`) — ✅ Changes complete, not committed

Python/Flask app. Changes made this session:
- `services/it_bot.py` — **new file** with `notify_ticket_created()`, `notify_ticket_updated()`, `build_changes()`
- `config.py` — added `IT_BOT_URL` and `IT_BOT_API_KEY` env vars
- `controllers/issues.py` — wired bot notifications into three trigger points
- `.env.example` — documented the two new env vars

**Three trigger points in `controllers/issues.py`:**
1. `_submit_issue()` → calls `notify_ticket_created()` after attachment upload (line ~116)
2. `_submit_helpdesk_issue()` → calls `notify_ticket_created()` after attachment upload (line ~234)
3. `admin_patch_issue()` → calls `notify_ticket_updated()` after successful `PATCH /issues` (line ~336)

Notifications are **fire-and-forget** — exceptions are caught and logged, never propagated to the caller.

---

## Files Actively Being Edited

### Bot (`C:\claude\rgmc-it-bot`)

- `src/services/supabase.ts` — Added `subscribeChannelDirect()` (lines ~57–87). Creates `bot_subscriptions` row directly without requiring a pre-existing registration code. Uses `SUB-` prefix + 8-char random code to distinguish from admin codes.
- `src/services/channelService.ts` — Added `subscribeChannel()` (lines ~74–139). Imports `subscribeChannelDirect`. `VALID_EVENTS` set declared at module level (unused directly, logic is inline in `subscribeChannel`).
- `src/bot.ts` — Added `subscribeChannel` to imports (line 7); added `case 'subscribe':` handler (lines ~117–132).
- `src/cards/helpCard.ts` — Added three `subscribe` command rows to the CHANNEL section (after `register` entry).

### Gateway (`C:\claude\rgmc-gateway`)

- `services/it_bot.py` — **New file.** `notify_ticket_created(ticket)`, `notify_ticket_updated(ticket, changes)`, `build_changes(before, patch)`. Silent on failure.
- `config.py` — Two new lines: `IT_BOT_URL = os.environ.get("IT_BOT_URL", "")` and `IT_BOT_API_KEY = os.environ.get("IT_BOT_API_KEY", "")`.
- `controllers/issues.py` — Three call sites added. Each introduces `created_issue: dict | None = None` local var to safely track the row returned by Supabase POST (avoids `rows` scoping issues).
- `.env.example` — New section `─── RGMC IT Bot` with `IT_BOT_URL` and `IT_BOT_API_KEY` docs.

---

## Failed Attempts

- **`'rows' in dir()` check in `_submit_issue()`** — First attempt to reference the Supabase `rows` variable outside its scope used `'rows' in dir() and rows`. This is non-idiomatic and unreliable Python. **Fixed** by introducing `created_issue: dict | None = None` declared before the `if SUPABASE_URL` block, assigned inside it.

---

## Next Step

**Commit both projects, then set the gateway env vars to connect them.**

1. Commit bot changes:
   ```
   cd C:\claude\rgmc-it-bot
   git add src/services/supabase.ts src/services/channelService.ts src/bot.ts src/cards/helpCard.ts
   git commit -m "add subscribe command and codeless channel subscription"
   ```

2. Commit gateway changes:
   ```
   cd C:\claude\rgmc-gateway
   git add services/it_bot.py config.py controllers/issues.py .env.example
   git commit -m "wire IT bot webhook notifications on ticket create and update"
   ```

3. Set these two env vars on the deployed gateway (Cloud Run → Edit & Deploy → Variables):
   ```
   IT_BOT_URL=https://<your-it-bot-cloud-run-url>
   IT_BOT_API_KEY=<same value as WEBHOOK_API_KEY on the bot>
   ```

4. Verify end-to-end: submit a test ticket via the helpdesk form → confirm the bot posts a card to a subscribed Teams channel.

---

## Context & Gotchas

**`subscribe` vs `register` distinction:**
- `register <CODE>` requires a pre-generated one-time code from `/api/admin/codes`. The code is validated against `bot_registration_codes` table and marked used.
- `subscribe` generates its own internal code (`SUB-XXXXXXXX`) and inserts directly into `bot_subscriptions` without touching the codes table. No admin involvement needed.
- Both end up as rows in `bot_subscriptions` and receive notifications identically. The `registration_code` column just holds different prefixes.

**`subscribe` default behavior — notify_created only:**
- Bare `@RGMC IT Bot subscribe` → `notify_created: true`, `notify_updated: false`, `notify_resolved: false`
- This is intentional: the primary use case is "alert us when a new issue is raised"
- `subscribe all` enables all three; `subscribe updated resolved` can mix-and-match

**Gateway bot notification is truly fire-and-forget:**
- `requests.post()` with `timeout=5` — if the bot is down or slow, the gateway continues normally
- Exceptions are `logger.warning(...)` only, never re-raised
- If `IT_BOT_URL` or `IT_BOT_API_KEY` is not set, `_ready()` returns `False` and the function exits immediately (safe default for local dev)

**`build_changes()` in `it_bot.py` converts all values to strings:**
- The bot's `TicketChanges` type expects `{ from: string | null, to: string | null }`
- `build_changes` uses `str(val) if val is not None else None` — handles int fields like `request_to_department_id`

**Patch context for `notify_ticket_updated`:**
- The gateway calls `notify_ticket_updated({**issue, **patch}, changes)` where `issue` is the pre-patch row from Supabase and `patch` is the dict of changed fields
- This constructs a "post-patch" ticket without a second DB fetch
- The `patch` dict may include `resolved_at` (added by the gateway on resolved transitions) — this is correctly included in the merged ticket sent to the bot

**Bot webhook security:**
- The bot checks `req.headers['x-api-key']` against `config.webhookApiKey` (= `WEBHOOK_API_KEY` env var) in `src/routes/webhook.ts:10–17`
- 401 is returned if missing or wrong — the gateway's `_headers()` function sends this as `"x-api-key": IT_BOT_API_KEY`

**Bot env vars required for full functionality:**
```
BOT_ID               — Azure App Registration Client ID
BOT_PASSWORD         — Azure App Registration Client Secret
TENANT_ID            — Entra Directory Tenant ID (single-tenant)
SUPABASE_URL         — https://eesrzpgmsrbhjeenfojq.supabase.co
SUPABASE_SERVICE_KEY — Supabase service role key
WEBHOOK_API_KEY      — Random secret shared with gateway as IT_BOT_API_KEY
GATEWAY_BASE_URL     — Gateway URL for "View Ticket" buttons in cards
GPT_API_KEY          — OpenAI key for `ask` command
GCP_API_URL          — Base URL of rgmc-gcp-api for DB query commands
```

**Supabase `bot_subscriptions` table shape:**
```
id                 uuid PK
channel_id         text UNIQUE
service_url        text
conversation_ref   jsonb
tenant_id          text
team_id            text
channel_name       text
registration_code  text  (admin codes: 'ABCD1234', self-subscribe: 'SUB-XXXXXXXX')
priority_filter    text[]
type_filter        text[]
notify_created     bool
notify_updated     bool
notify_resolved    bool
created_at         timestamptz
updated_at         timestamptz
```

**Teams Adaptive Card size limit:** ~28KB. `MAX_TOTAL_ROWS = 15` in `src/cards/queryResultCard.ts`. Reduce if size errors occur with large result sets.

**Node version:** Node 22 — native `fetch` is used in `gcpService.ts`, and a `node-fetch` shim in `app.ts` patches the botframework's internal `node-fetch` v2 calls to use native fetch instead (avoids Gunzip errors on Node 22).

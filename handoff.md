# Handoff

## Goal

Build and maintain the **RGMC IT Teams Bot** (`C:\claude\rgmc-it-bot`) — a Microsoft Teams bot registered on the RGMC Entra organization that:

- Notifies subscribed Teams channels when IT tickets are created or updated (pushed from `C:\claude\rgmc-gateway`)
- Lets users query ticket status, check site health, query GCP/MSSQL databases, and ask AI questions
- Supports both admin-code-based registration (`register <CODE>`) and self-service channel subscription (`subscribe`)
- Exposes webhook endpoints (`/api/notify/*`) that `rgmc-gateway` (Python/Flask) calls after ticket create/update events
- Supports department-scoped subscriptions so channels only receive events relevant to their department

End state: both projects deployed to Cloud Run, gateway configured with bot URL + API key, all Teams channels able to self-subscribe and receive real-time ticket alerts with visually distinct priority indicators.

---

## Current State

### Bot (`C:\claude\rgmc-it-bot`) — ✅ Fully committed, clean working tree

`npx tsc --noEmit` passes. Last three commits:
- `afa7b4f added new command parameters` — `subscribe department <DEPT>` feature
- `9fbae30 added bot card design` — ticketCard.ts enhanced priority visuals
- `22194c1 added subscribe command` — self-service subscription feature

**All working bot commands:**
| Command | Function |
|---|---|
| `subscribe` | Self-service subscription (notify_created only) |
| `subscribe all` | Subscribe to created + updated + resolved |
| `subscribe created updated resolved` | Mix-and-match event types |
| `subscribe department <DEPT>` | Subscribe, only receive tickets for a specific department |
| `subscribe all department <DEPT>` | All events, department-scoped (multi-word dept names supported) |
| `register <CODE>` | Admin-code-based registration |
| `unregister` | Remove subscription |
| `configure all / priority / type` | Filter notifications |
| `status` | Show current subscription config (now shows dept filter) |
| `ticket <NUMBER>` | Look up ticket status |
| `gumagana po ba yung <SITE>` | Ping site |
| `anong site po yung <SYSTEM>` | Get site URL |
| `ask <QUESTION>` | GPT-powered AI assistant |
| `bigquery <table> <col> <val>` | Query BigQuery |
| `bigquery latest <table> <datecol>` | Latest BigQuery rows |
| `<db_name> <table> <col> <val>` | Generic MSSQL query |
| `vibe check` | Bot health check |

**Webhook endpoints (called by gateway):**
- `POST /api/notify/ticket-created` — `{ event: "ticket.created", ticket: Ticket }`
- `POST /api/notify/ticket-updated` — `{ event: "ticket.updated", ticket: Ticket, changes: TicketChanges }`
- `POST /api/notify` — unified endpoint, dispatches on `payload.event`
- All require `x-api-key` header matching `WEBHOOK_API_KEY` env var

### Gateway (`C:\claude\rgmc-gateway`) — ✅ Fully committed, clean working tree

- `e4ecc7b added bot services` (Jun 24) — committed `services/it_bot.py`, `config.py` bot vars, `controllers/issues.py` trigger points, `.env.example` docs
- Most recent commit: `ea30334 added more metrics for analytics`

---

## Files Actively Being Edited

No files are mid-edit. Everything was committed this session (`afa7b4f`).

### Changes committed this session (`afa7b4f added new command parameters`)

- `src/types/index.ts` — Added `department_filter: string | null` to `BotSubscription` interface
- `src/services/supabase.ts` — Added `departmentFilter: string | null` param to `subscribeChannelDirect()` (stored as `department_filter` column in upsert); added `department_filter?: string | null` to `updateSubscriptionFilters()` filter type
- `src/services/channelService.ts` — `subscribeChannel()` now accepts `departmentFilter: string | null = null` and passes it through to `subscribeChannelDirect()`; success message includes dept info if set; `getChannelStatus()` shows `department_filter` in active filters list; `matchesFilters()` expanded ticket param type to include `department` and `assigned_to`, added department check (exact match on `ticket.department` OR substring match on `ticket.assigned_to`)
- `src/bot.ts` — `subscribe` case now parses `department <NAME>` keyword from args (multi-word dept names supported, e.g. `subscribe all department Human Resources`); validates that a name follows the keyword; passes `departmentFilter` to `subscribeChannel()`
- `src/cards/helpCard.ts` — Added two new command rows in CHANNEL section: `subscribe department <DEPT>` and `subscribe all department <DEPT>`

---

## Failed Attempts

No failed attempts this session. All changes compiled clean on first pass (`npx tsc --noEmit` — no output = success).

---

## Next Step

**Add the `department_filter` column to the Supabase `bot_subscriptions` table.** The bot code is already written to read/write this column but it doesn't exist in the DB yet, so `subscribe department <DEPT>` will fail silently (Supabase upsert will ignore unknown columns depending on configuration, or error).

Run this SQL in the Supabase dashboard (project: `eesrzpgmsrbhjeenfojq`):

```sql
ALTER TABLE bot_subscriptions ADD COLUMN department_filter text DEFAULT NULL;
```

After that, do an end-to-end test:
1. In a Teams channel, run: `@RGMC IT Bot subscribe department IT`
2. Verify the bot confirms with the department filter in the success message
3. Run `@RGMC IT Bot status` — confirm `• Department: IT` shows under Active filters
4. Submit a test ticket from an IT department user via the helpdesk form
5. Confirm the channel receives the notification; submit one from a different department and confirm it is NOT delivered

---

## Context & Gotchas

**Department filter matching logic (`channelService.ts:260–265`):**
- Exact case-insensitive match on `ticket.department` (the filer's department column from the `issues` table)
- OR substring match on `ticket.assigned_to` (covers cases like "IT Support Team" assigned_to values)
- The `Ticket.department` field is the requester's department, not an "assigned department" — there is no `assigned_department` column in the issues table. If the gateway adds one later, `matchesFilters` should be updated to check it.

**Subscribe arg parsing order (`bot.ts:117–148`):**
- `department` keyword must appear AFTER any event selectors: `subscribe created department IT` ✅
- Everything after `department` is taken as the dept name via `origArgs.slice(deptIdx + 1).join(' ')` — supports multi-word names
- If `department` keyword is present but no name follows, the bot replies with an error

**`subscribe` vs `register` distinction:**
- `register <CODE>` requires a pre-generated one-time code from `/api/admin/codes`. Validated against `bot_registration_codes` table and marked used. Does NOT support `department_filter` — if needed, the user must `configure` after registration.
- `subscribe` generates its own internal code (`SUB-XXXXXXXX`) and inserts directly into `bot_subscriptions` with `department_filter`. No admin involvement.
- Both end up as rows in `bot_subscriptions` and receive notifications identically.

**`subscribe` default behavior — notify_created only:**
- Bare `subscribe` → `notify_created: true`, `notify_updated: false`, `notify_resolved: false`
- `subscribe all` enables all three; `subscribe updated resolved` can mix-and-match.
- `subscribe department IT` → notify_created only + dept filter (wantsAll logic at `channelService.ts:96`)

**Gateway bot notification is fire-and-forget:**
- `requests.post()` with `timeout=5` — if bot is down or slow, gateway continues normally
- Exceptions are `logger.warning()` only, never re-raised
- If `IT_BOT_URL` or `IT_BOT_API_KEY` is unset, `_ready()` returns `False` and the function exits silently (safe for local dev)

**`build_changes()` converts all values to strings:**
- Bot's `TicketChanges` type expects `{ from: string | null, to: string | null }`
- `build_changes` uses `str(val) if val is not None else None` — handles int fields like `request_to_department_id`

**Patch context for `notify_ticket_updated`:**
- Gateway calls `notify_ticket_updated({**issue, **patch}, changes)` where `issue` is the pre-patch row and `patch` is changed fields
- Constructs a "post-patch" ticket without a second DB fetch

**Bot webhook security:**
- Checks `req.headers['x-api-key']` against `config.webhookApiKey` (`WEBHOOK_API_KEY` env var) in `src/routes/webhook.ts:10–17`
- Returns 401 if missing or wrong

**Adaptive Card color limits:**
- Adaptive Cards in Teams do not support hex colors — only named values: `default`, `dark`, `light`, `accent`, `good`, `warning`, `attention`
- Container `style` values: `default`, `emphasis`, `good`, `attention`, `warning`
- These map to the user's Teams theme colors, so exact shade varies per theme

**Bot env vars required for full functionality:**
```
BOT_ID               — Azure App Registration Client ID
BOT_PASSWORD         — Azure App Registration Client Secret
TENANT_ID            — Entra Directory Tenant ID (single-tenant)
SUPABASE_URL         — https://eesrzpgmsrbhjeenfojq.supabase.co
SUPABASE_SERVICE_KEY — Supabase service role key
WEBHOOK_API_KEY      — Random secret shared with gateway as IT_BOT_API_KEY
GATEWAY_BASE_URL     — Gateway URL for "View Ticket" buttons in cards
BOT_BASE_URL         — Bot's own URL (for logo image in cards)
GPT_API_KEY          — OpenAI key for `ask` command
GCP_API_URL          — Base URL of rgmc-gcp-api for DB query commands
```

**Supabase `bot_subscriptions` table shape (after the required ALTER TABLE):**
```
id                 uuid PK
channel_id         text UNIQUE
service_url        text
conversation_ref   jsonb
tenant_id          text
team_id            text
channel_name       text
registration_code  text  (admin: 'ABCD1234', self-subscribe: 'SUB-XXXXXXXX')
priority_filter    text[]
type_filter        text[]
department_filter  text   ← NEW — must be added via ALTER TABLE
notify_created     bool
notify_updated     bool
notify_resolved    bool
created_at         timestamptz
updated_at         timestamptz
```

**Teams Adaptive Card size limit:** ~28KB. `MAX_TOTAL_ROWS = 15` in `src/cards/queryResultCard.ts`. Reduce if size errors occur with large result sets.

**Node version:** Node 22 — native `fetch` used in `gcpService.ts`. A `node-fetch` shim in `app.ts` patches the botframework's internal `node-fetch` v2 calls to use native fetch (avoids Gunzip errors on Node 22).

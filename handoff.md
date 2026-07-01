# Handoff

## Goal

Build and maintain the **RGMC IT Teams Bot** (`C:\claude\rgmc-it-bot`) — a Microsoft Teams bot registered on the RGMC Entra organization that:

- Notifies subscribed Teams channels when IT tickets are created or updated (pushed from `C:\claude\rgmc-gateway`)
- Lets users query ticket status, check site health, query GCP/MSSQL databases, and ask AI questions
- Supports both admin-code-based registration (`register <CODE>`) and self-service channel subscription (`subscribe`)
- Exposes webhook endpoints (`/api/notify/*`) that `rgmc-gateway` (Python/Flask) calls after ticket create/update events

End state: both projects deployed to Cloud Run, gateway configured with bot URL + API key, all Teams channels able to self-subscribe and receive real-time ticket alerts with visually distinct priority indicators.

---

## Current State

### Bot (`C:\claude\rgmc-it-bot`) — ✅ Fully committed, clean working tree

`npx tsc --noEmit` passes. Last two commits:
- `9fbae30 added bot card design` — ticketCard.ts enhanced priority visuals
- `22194c1 added subscribe command` — self-service subscription feature

**All working bot commands:**
| Command | Function |
|---|---|
| `subscribe` | Self-service subscription (notify_created only) |
| `subscribe all` | Subscribe to created + updated + resolved |
| `subscribe created updated resolved` | Mix-and-match event types |
| `register <CODE>` | Admin-code-based registration |
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

No files are mid-edit. Everything was committed this session.

### Changes committed this session (bot — `9fbae30`)

- `src/cards/ticketCard.ts` — Enhanced priority indicators: replaced `priorityStrip()` with `priorityBadge()`. Added three new constants and updated the inline priority TextBlock in `buildTicketStatusCard`.

### Changes committed in prior sessions

- `src/bot.ts` — `subscribe` command handler wired in
- `src/cards/helpCard.ts` — Three new `subscribe` command rows in CHANNEL section
- `src/services/channelService.ts` — `subscribeChannel()` added
- `src/services/supabase.ts` — `subscribeChannelDirect()` added

### Gateway (`C:\claude\rgmc-gateway`)

- `services/it_bot.py` — `notify_ticket_created()`, `notify_ticket_updated()`, `build_changes()` — fire-and-forget
- `config.py` — `IT_BOT_URL` and `IT_BOT_API_KEY` env vars
- `controllers/issues.py` — Three call sites: `_submit_issue()`, `_submit_helpdesk_issue()`, `admin_patch_issue()`
- `.env.example` — Documented the two new env vars

---

## Failed Attempts

- **`'rows' in dir()` check in gateway `_submit_issue()`** — First attempt to reference the Supabase `rows` variable outside its scope. Non-idiomatic and unreliable Python. Fixed by introducing `created_issue: dict | None = None` declared before the `if SUPABASE_URL` block.

---

## Priority Card Design (This Session)

`src/cards/ticketCard.ts` — Key changes to understand:

**Old `priorityStrip` (removed):** Single-row container with small icon + text, no color on text.

**New `priorityBadge` (current):** ColumnSet layout inside a styled container:
- Left col: icon at `Large` size for critical/high, `Medium` for medium/low
- Center col: bold priority label at `Default` size for critical/high, `Small` for medium/low + subtitle line (e.g., "Requires immediate attention")
- Right col (critical/high only): action tag — `⚠️ ACTION REQUIRED` or `⚡ URGENT`

**Inline priority column in `buildTicketStatusCard`:** Now uses `color` property matching `PRIORITY_COLOR` map (`attention` / `warning` / `accent` / `good`) so the text itself renders in Teams theme red/orange/blue/green.

New constants added:
```ts
PRIORITY_SUBTITLE  // e.g., "Requires immediate attention"
PRIORITY_COLOR     // maps to Adaptive Card TextBlock color values
PRIORITY_ACTION_TAG // "⚠️ ACTION REQUIRED" / "⚡ URGENT" for critical/high only
```

---

## Next Step

**End-to-end deployment test.** Both codebases are committed and complete. The only remaining work is wiring the live deployed services together:

1. Deploy the bot to Cloud Run (or confirm it's already deployed): note the service URL.
2. Set these two env vars on the **gateway** Cloud Run service:
   ```
   IT_BOT_URL=https://<your-it-bot-cloud-run-url>
   IT_BOT_API_KEY=<same value as WEBHOOK_API_KEY on the bot>
   ```
3. Verify end-to-end: submit a test ticket via the helpdesk form → confirm the bot posts a card to a subscribed Teams channel.
4. Test all four priority levels (critical / high / medium / low) to validate the new badge layout renders correctly in Teams.

---

## Context & Gotchas

**`subscribe` vs `register` distinction:**
- `register <CODE>` requires a pre-generated one-time code from `/api/admin/codes`. Validated against `bot_registration_codes` table and marked used.
- `subscribe` generates its own internal code (`SUB-XXXXXXXX`) and inserts directly into `bot_subscriptions` without touching the codes table. No admin involvement.
- Both end up as rows in `bot_subscriptions` and receive notifications identically.

**`subscribe` default behavior — notify_created only:**
- Bare `subscribe` → `notify_created: true`, `notify_updated: false`, `notify_resolved: false`
- `subscribe all` enables all three; `subscribe updated resolved` can mix-and-match.

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

**Supabase `bot_subscriptions` table shape:**
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
notify_created     bool
notify_updated     bool
notify_resolved    bool
created_at         timestamptz
updated_at         timestamptz
```

**Teams Adaptive Card size limit:** ~28KB. `MAX_TOTAL_ROWS = 15` in `src/cards/queryResultCard.ts`. Reduce if size errors occur with large result sets.

**Node version:** Node 22 — native `fetch` used in `gcpService.ts`. A `node-fetch` shim in `app.ts` patches the botframework's internal `node-fetch` v2 calls to use native fetch (avoids Gunzip errors on Node 22).

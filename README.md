<div align="center">

# <span style="color:#A07320">🤖 RGMC IT Bot</span>

<span style="color:#666">Microsoft Teams bot for real-time IT ticket notifications and status lookups — integrated with the RGMC Gateway helpdesk system.</span>

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3.3-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Bot Framework](https://img.shields.io/badge/Bot_Framework-4.22.3-0078D4?style=flat-square&logo=microsoft&logoColor=white)](https://dev.botframework.com/)
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-2.39.0-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![Express](https://img.shields.io/badge/Express-4.18.2-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Tech Stack](#-tech-stack)
- [Features](#-features)
- [Bot Commands](#-bot-commands)
- [Project Structure](#-project-structure)
- [Setup & Installation](#-setup--installation)
- [Microsoft Entra & Azure Bot Registration](#-microsoft-entra--azure-bot-registration)
- [Environment Variables](#-environment-variables)
- [Database Setup (Supabase)](#-database-setup-supabase)
- [Running the App](#-running-the-app)
- [Building for Production](#-building-for-production)
- [Docker Deployment](#-docker-deployment)
- [API Endpoints](#-api-endpoints)
- [rgmc-gateway Integration](#-rgmc-gateway-integration)
- [Channel Registration Flow](#-channel-registration-flow)
- [Notification Flow](#-notification-flow)
- [Adaptive Card Design](#-adaptive-card-design)
- [Data Model](#-data-model)
- [License](#-license)

---

## <span style="color:#A07320">🔍 Overview</span>

**RGMC IT Bot** is a Microsoft Teams bot built on the **Bot Framework v4 SDK** that bridges the RGMC Gateway helpdesk system with Teams channels. It delivers proactive, Adaptive Card–formatted ticket notifications when IT tickets are created or updated, and lets any user look up a ticket's current status by number — directly inside Teams.

The bot uses a **code-based channel registration** model (inspired by GitHub's Teams integration): an IT admin generates a one-time code, and a Teams channel owner redeems it with a single `@mention` command. Once registered, the channel receives filtered notifications without any further configuration.

**Key design decisions:**
- Stateless bot process — all subscription state lives in Supabase (same DB as the gateway)
- API key–secured webhook endpoints so only the trusted gateway can trigger notifications
- Single-tenant or multi-tenant Entra App Registration via a single `TENANT_ID` env var toggle
- Per-channel notification filters (priority, ticket type) stored in Supabase

---

## <span style="color:#A07320">🛠️ Tech Stack</span>

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | 5.3.3 |
| Runtime | Node.js | 20 |
| Bot SDK | botbuilder (Microsoft Bot Framework) | ^4.22.3 |
| HTTP Server | Express.js | ^4.18.2 |
| Database | Supabase (PostgreSQL via PostgREST) | ^2.39.0 |
| Config | dotenv | ^16.3.1 |
| Container | Docker (node:20-alpine) | — |

---

## <span style="color:#A07320">✨ Features</span>

### <span style="color:#2a9d8f">🔔 Proactive Ticket Notifications</span>

- Sends Teams Adaptive Cards when a ticket is **created**, **updated**, or **resolved**
- Notifications are triggered by the `rgmc-gateway` via secure webhook endpoints
- Each registered channel receives only the notifications that match its configured filters

### <span style="color:#2a9d8f">📺 Channel Registration</span>

- Admin generates a one-time registration code via the admin API
- Channel owner redeems it with `@RGMC IT Bot register <CODE>` in Teams
- Code is validated, marked used, and the full `ConversationReference` is stored in Supabase for proactive messaging

### <span style="color:#2a9d8f">🔎 Ticket Status Lookup</span>

- Any user can ask the bot: `@RGMC IT Bot ticket IT-00042`
- Bot queries Supabase and responds with a rich Adaptive Card showing status, assignee, priority, and resolution notes

### <span style="color:#2a9d8f">⚙️ Notification Filtering</span>

Per-channel configurable filters:
- **Priority filter** — e.g. only `high` and `critical`
- **Type filter** — e.g. only `incident` or `service_request`
- **Event toggles** — independently enable/disable created, updated, and resolved notifications
- `configure all` resets to receive everything

### <span style="color:#2a9d8f">🛡️ Admin API</span>

Secured with `X-API-Key` header:
- Generate new registration codes (with optional label and expiry)
- List all codes and their usage state
- List all registered channel subscriptions

---

## <span style="color:#A07320">💬 Bot Commands</span>

All commands are issued by **@mentioning** the bot in a Teams channel or chat.

| Command | Description |
|---|---|
| `@RGMC IT Bot register <CODE>` | Register this channel to receive ticket notifications using the provided one-time code |
| `@RGMC IT Bot unregister` | Remove this channel from ticket notifications |
| `@RGMC IT Bot ticket <TICKET-NUMBER>` | Look up the current status of a ticket (e.g. `ticket IT-00042`) |
| `@RGMC IT Bot configure all` | Reset all filters — receive notifications for every ticket |
| `@RGMC IT Bot configure priority high critical` | Filter notifications to only high / critical priority tickets |
| `@RGMC IT Bot configure type incident service_request` | Filter notifications by ticket type |
| `@RGMC IT Bot status` | Show this channel's registration state and active filters |
| `@RGMC IT Bot help` | Display the full command reference |

> 📌 **Valid priority values:** `low`, `medium`, `high`, `critical`
>
> 📌 **Valid type values:** `incident`, `service_request`, `change_request`

---

## <span style="color:#A07320">📁 Project Structure</span>

```
rgmc-it-bot/
├── src/
│   ├── app.ts                      # Express server + CloudAdapter setup + route registration
│   ├── bot.ts                      # RgmcItBot (TeamsActivityHandler) — command parser & dispatcher
│   ├── config.ts                   # Typed env config with required-var enforcement
│   │
│   ├── types/
│   │   └── index.ts                # TypeScript interfaces: Ticket, BotSubscription, RegistrationCode, NotifyTicketPayload
│   │
│   ├── services/
│   │   ├── supabase.ts             # All Supabase queries (tickets, subscriptions, codes)
│   │   ├── channelService.ts       # Registration logic, filter config, status reporting
│   │   └── notificationService.ts  # Proactive messaging — fan-out to all matching subscriptions
│   │
│   ├── cards/
│   │   └── ticketCard.ts           # Adaptive Card builders: created, updated, status-lookup cards
│   │
│   └── routes/
│       ├── webhook.ts              # POST /api/notify/* — webhook endpoints for rgmc-gateway
│       ├── admin.ts                # POST/GET /api/admin/* — code & subscription management
│       └── health.ts               # GET /health — readiness probe
│
├── dist/                           # Compiled JavaScript output (generated by tsc)
├── supabase_setup.sql              # SQL to create bot_subscriptions, bot_registration_codes tables
├── Dockerfile                      # Multi-stage Node 20 Alpine build
├── .env.example                    # Environment variable template
├── .gitignore
├── package.json
└── tsconfig.json
```

---

## <span style="color:#A07320">⚙️ Setup & Installation</span>

### <span style="color:#2a9d8f">📋 Prerequisites</span>

- **Node.js 20+** — [Download](https://nodejs.org/)
- **npm 10+** (bundled with Node 20)
- **A Supabase project** — same project used by `rgmc-gateway`
- **An Azure subscription** with permission to create App Registrations in Microsoft Entra
- **Microsoft Teams admin access** (or IT admin) to install the bot in your org

### <span style="color:#2a9d8f">📥 Clone & Install</span>

```bash
git clone https://github.com/your-org/rgmc-it-bot.git
cd rgmc-it-bot
npm install
```

---

## <span style="color:#A07320">🔐 Microsoft Entra & Azure Bot Registration</span>

> ⚠️ **Complete these steps before running the bot.** The bot cannot authenticate with Teams without a registered Azure application and Azure Bot resource.

### <span style="color:#2a9d8f">Step 1 — Create an App Registration in Microsoft Entra</span>

1. Go to [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. Fill in:
   - **Name:** `RGMC IT Bot`
   - **Supported account types:** *Accounts in this organizational directory only (Single tenant)* — recommended for org-internal bots
3. Click **Register**
4. Copy the **Application (client) ID** → this is your `BOT_ID`
5. Copy the **Directory (tenant) ID** → this is your `TENANT_ID`

### <span style="color:#2a9d8f">Step 2 — Create a Client Secret</span>

1. In your App Registration → **Certificates & secrets** → **New client secret**
2. Set description: `rgmc-it-bot-secret`, expiry: 24 months
3. Click **Add**
4. **Immediately copy the secret VALUE** (it is hidden after you navigate away) → this is your `BOT_PASSWORD`

### <span style="color:#2a9d8f">Step 3 — Create an Azure Bot Resource</span>

1. In the Azure Portal → **Create a resource** → search **Azure Bot** → **Create**
2. Fill in:
   - **Bot handle:** `rgmc-it-bot`
   - **Subscription / Resource group:** your org's
   - **Pricing tier:** F0 (Free) is sufficient for internal use
   - **Microsoft App ID:** choose *Use existing app registration* → paste the **Application (client) ID** from Step 1
3. Click **Review + create** → **Create**

### <span style="color:#2a9d8f">Step 4 — Configure the Messaging Endpoint</span>

1. In your Azure Bot resource → **Configuration**
2. Set **Messaging endpoint** to your bot's public URL:
   ```
   https://your-bot-host.run.app/api/messages
   ```
   > 💡 For local development use [Dev Tunnels](https://learn.microsoft.com/en-us/azure/developer/dev-tunnels/overview) or [ngrok](https://ngrok.com/): `ngrok http 3978`  then set `https://<id>.ngrok-free.app/api/messages`
3. Click **Apply**

### <span style="color:#2a9d8f">Step 5 — Enable the Microsoft Teams Channel</span>

1. In your Azure Bot resource → **Channels** → **Add a featured channel** → **Microsoft Teams**
2. Accept the Terms of Service → **Save**

### <span style="color:#2a9d8f">Step 6 — Create & Install the Teams App Manifest</span>

1. Go to the [Teams Developer Portal](https://dev.teams.microsoft.com/) → **Apps** → **New app**
2. Fill in basic info (name: `RGMC IT Bot`, short description, long description)
3. Under **App features** → **Bot** → paste your **Application (client) ID** as the Bot ID
4. Enable: **Personal**, **Team**, **Group chat** scopes as needed
5. Download the app package (`.zip`)
6. In Microsoft Teams → **Apps** → **Manage your apps** → **Upload an app** → choose the `.zip`
   - Or have your Teams admin publish it to the org app catalog

---

## <span style="color:#A07320">🌐 Environment Variables</span>

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
```

| Variable | File | Required | Description |
|---|---|---|---|
| `BOT_ID` | `.env` | ✅ | Azure App Registration **Application (client) ID** |
| `BOT_PASSWORD` | `.env` | ✅ | Azure App Registration **client secret value** |
| `TENANT_ID` | `.env` | ✅ for single-tenant | Azure **Directory (tenant) ID** — omit for multi-tenant |
| `SUPABASE_URL` | `.env` | ✅ | Supabase project URL (same as rgmc-gateway) |
| `SUPABASE_SERVICE_KEY` | `.env` | ✅ | Supabase **service role** key (bypasses RLS) |
| `WEBHOOK_API_KEY` | `.env` | ✅ | Shared secret for webhook endpoints — sent as `X-API-Key` |
| `GATEWAY_BASE_URL` | `.env` | Optional | Base URL of rgmc-gateway — enables "View Ticket" button in cards |
| `PORT` | `.env` | Optional | HTTP port (default: `3978`) |

> ⚠️ Never commit `.env` to source control. Use Secret Manager or Cloud Run secrets in production.

---

## <span style="color:#A07320">🗄️ Database Setup (Supabase)</span>

The bot shares the Supabase project with `rgmc-gateway`. Run the bot's SQL additions once:

1. Open **Supabase Dashboard** → **SQL Editor** → **New Query**
2. Paste the contents of `supabase_setup.sql` and run

This creates:

| Table | Purpose |
|---|---|
| `bot_registration_codes` | One-time codes generated by admins and redeemed by channel owners |
| `bot_subscriptions` | One row per registered Teams channel; stores `ConversationReference` as JSONB |

It also adds any missing columns to the existing `issues` table (`ticket_number`, `priority`, `assigned_to`, etc.) and installs the `IT-XXXXX` auto-numbering trigger.

---

## <span style="color:#A07320">▶️ Running the App</span>

### <span style="color:#2a9d8f">Development</span>

```bash
# Using ts-node (no compile step)
npm run dev
```

### <span style="color:#2a9d8f">Watch mode (auto-recompile)</span>

```bash
npm run watch
# In another terminal:
npm start
```

The server starts on port `3978` by default and prints all registered endpoints:

```
RGMC IT Bot running on port 3978
  Messaging endpoint : POST /api/messages
  Ticket created     : POST /api/notify/ticket-created
  Ticket updated     : POST /api/notify/ticket-updated
  Unified notify     : POST /api/notify
  Admin codes        : POST/GET /api/admin/codes
  Subscriptions      : GET /api/admin/subscriptions
  Health             : GET /health
```

### <span style="color:#2a9d8f">Local tunnel for Teams testing</span>

Teams requires a **public HTTPS URL**. Use Dev Tunnels or ngrok during development:

```bash
# ngrok
ngrok http 3978
# Copy the https URL and set it as the Messaging Endpoint in Azure Bot Configuration
```

---

## <span style="color:#A07320">📦 Building for Production</span>

```bash
npm run build
```

Output goes to `dist/`. Start the compiled app:

```bash
node dist/app.js
```

> 💡 Set all env vars in your deployment environment (Cloud Run, App Service, etc.) rather than using a `.env` file.

---

## <span style="color:#A07320">🐳 Docker Deployment</span>

The `Dockerfile` uses a multi-stage build: compiles TypeScript in a builder stage, then copies only the compiled output and production dependencies into the final Alpine image.

```bash
# Build the image
docker build -t rgmc-it-bot .

# Run locally
docker run -p 3978:3978 \
  -e BOT_ID=your-bot-id \
  -e BOT_PASSWORD=your-bot-password \
  -e TENANT_ID=your-tenant-id \
  -e SUPABASE_URL=https://your-project.supabase.co \
  -e SUPABASE_SERVICE_KEY=your-service-role-key \
  -e WEBHOOK_API_KEY=your-webhook-secret \
  -e GATEWAY_BASE_URL=https://your-gateway.run.app \
  rgmc-it-bot
```

### <span style="color:#2a9d8f">Deploy to Google Cloud Run</span>

```bash
# Build & push
gcloud builds submit --tag gcr.io/YOUR_PROJECT/rgmc-it-bot

# Deploy
gcloud run deploy rgmc-it-bot \
  --image gcr.io/YOUR_PROJECT/rgmc-it-bot \
  --platform managed \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --port 3978 \
  --set-env-vars BOT_ID=...,BOT_PASSWORD=...,TENANT_ID=...,...
```

---

## <span style="color:#A07320">🔌 API Endpoints</span>

### <span style="color:#2a9d8f">🤖 Bot Framework</span>

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/messages` | Bot Framework JWT | Teams → Bot messaging endpoint; **must match Azure Bot Configuration** |

### <span style="color:#2a9d8f">🔔 Notification Webhooks (called by rgmc-gateway)</span>

All webhook endpoints require `X-API-Key: <WEBHOOK_API_KEY>` header.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/notify` | Unified endpoint — dispatches based on `event` field |
| `POST` | `/api/notify/ticket-created` | Notify registered channels of a new ticket |
| `POST` | `/api/notify/ticket-updated` | Notify registered channels of a ticket update |

**`POST /api/notify` request body:**

```json
{
  "event": "ticket.created",
  "ticket": {
    "id": "uuid",
    "ticket_number": "IT-00042",
    "title": "Cannot log in to travel portal",
    "description": "Getting 401 error when trying to log in...",
    "status": "pending",
    "priority": "high",
    "urgency": "high",
    "assigned_to": null,
    "employee_name": "Juan Dela Cruz",
    "company_name": "RGMC",
    "department": "Finance",
    "site_name": "travel-expense",
    "ticket_type": "incident",
    "request_category": "Software",
    "email": "juan@rgmcgroup.com",
    "viber_number": "09171234567",
    "from_helpdesk": true,
    "created_at": "2026-06-18T10:00:00Z",
    "resolved_at": null,
    "resolution_notes": null,
    "resolved_by": null,
    "attachment_urls": null
  }
}
```

**`POST /api/notify/ticket-updated` — additional `changes` field:**

```json
{
  "event": "ticket.updated",
  "ticket": { "...": "full ticket object after update" },
  "changes": {
    "status": { "from": "pending", "to": "in_progress" },
    "assigned_to": { "from": null, "to": "erwin.arellano" }
  }
}
```

**Response (success):**
```json
{ "success": true, "message": "Notification dispatched" }
```

### <span style="color:#2a9d8f">🛠️ Admin (code & subscription management)</span>

All admin endpoints require `X-API-Key: <WEBHOOK_API_KEY>` header.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/admin/codes` | Generate a new one-time channel registration code |
| `GET` | `/api/admin/codes` | List all registration codes and their usage state |
| `GET` | `/api/admin/subscriptions` | List all registered Teams channels and their filter config |

**`POST /api/admin/codes` request body:**

```json
{ "label": "IT Helpdesk - Manila Office" }
```

**Response:**

```json
{
  "code": "X7K2MB4N",
  "label": "IT Helpdesk - Manila Office",
  "used": false,
  "used_by_channel": null,
  "created_at": "2026-06-18T10:00:00Z",
  "expires_at": null
}
```

**`GET /api/admin/subscriptions` response:**

```json
[
  {
    "id": "uuid",
    "channel_id": "19:abc123@thread.tacv2",
    "channel_name": "IT Notifications",
    "team_id": "19:team-id",
    "registration_code": "X7K2MB4N",
    "priority_filter": ["high", "critical"],
    "type_filter": null,
    "notify_created": true,
    "notify_updated": true,
    "notify_resolved": true,
    "created_at": "2026-06-18T10:05:00Z"
  }
]
```

### <span style="color:#2a9d8f">❤️ Health</span>

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Returns `{ status: "ok", timestamp: "..." }` |

---

## <span style="color:#A07320">🔗 rgmc-gateway Integration</span>

The bot's notification endpoints are designed to be called from `rgmc-gateway` (`C:\claude\rgmc-gateway`) after ticket create/update events. Add these calls to `controllers/issues.py`:

```python
import requests
import os

BOT_BASE_URL = os.environ.get("RGMC_BOT_URL", "")
BOT_API_KEY  = os.environ.get("RGMC_BOT_API_KEY", "")

def _notify_bot(event: str, ticket: dict, changes: dict | None = None):
    if not BOT_BASE_URL or not BOT_API_KEY:
        return
    payload = {"event": event, "ticket": ticket}
    if changes:
        payload["changes"] = changes
    try:
        requests.post(
            f"{BOT_BASE_URL}/api/notify",
            json=payload,
            headers={"X-API-Key": BOT_API_KEY},
            timeout=5,
        )
    except Exception as exc:
        current_app.logger.warning("Bot notify failed: %s", exc)
```

**New env vars to add to `rgmc-gateway`'s `.env`:**

```env
RGMC_BOT_URL=https://your-bot.run.app
RGMC_BOT_API_KEY=same-value-as-WEBHOOK_API_KEY-in-bot
```

Call `_notify_bot("ticket.created", ticket_row)` after a successful insert, and `_notify_bot("ticket.updated", updated_ticket, changes_dict)` in `admin_patch_issue`.

---

## <span style="color:#A07320">📺 Channel Registration Flow</span>

```
Admin                    Bot API               Teams Channel          Supabase
  |                         |                       |                     |
  |-- POST /api/admin/codes  |                       |                     |
  |   { label: "Manila IT" } |                       |                     |
  |<-- { code: "X7K2MB4N" } -|                       |                     |
  |                         |                       |                     |
  |-- shares code with ------+-----> Channel owner   |                     |
  |                         |           |           |                     |
  |                         |  @RGMC IT Bot register X7K2MB4N             |
  |                         |<----------+-----------+                     |
  |                         |  validate code                              |
  |                         |------------------------------------------>  |
  |                         |  <-- code valid, not used                   |
  |                         |  store ConversationReference                |
  |                         |<------------------------------------------> |
  |                         |  mark code used                             |
  |                         |------------------------------------------>  |
  |                         |  reply: "✅ Channel registered!"            |
  |                         +---------> Teams Channel                     |
```

---

## <span style="color:#A07320">📡 Notification Flow</span>

```
rgmc-gateway                Bot Server            Supabase           Teams Channels
     |                          |                     |                    |
     |-- POST /api/notify ------>|                     |                    |
     |   { event, ticket }      |                     |                    |
     |                          |-- getAllSubscriptions()                   |
     |                          |<--------------------|                    |
     |                          |  for each subscription                   |
     |                          |  that matches filters:                   |
     |                          |  build Adaptive Card                     |
     |                          |  continueConversationAsync() ------------>|
     |                          |  (proactive message)                     |
     |<-- { success: true } ----|                                          |
```

---

## <span style="color:#A07320">🃏 Adaptive Card Design</span>

The bot sends three card variants, all using the Adaptive Card schema v1.4:

### <span style="color:#2a9d8f">🎫 Ticket Created Card</span>

- Header container with ticket number and title
- `FactSet` rows: status, priority, reporter, department, system/site, type, submission time
- Description preview (truncated to 300 chars)
- "View Ticket" button → links to `GATEWAY_BASE_URL/admin/issues#<id>` (if configured)

### <span style="color:#2a9d8f">🔄 Ticket Updated Card</span>

- Distinct emoji (✅ for resolved, 🔄 for other updates)
- **"What changed"** `FactSet` with strikethrough old values → bold new values
- **"Current state"** `FactSet` with current status, assignee, and resolution notes
- "View Ticket" button

### <span style="color:#2a9d8f">🔎 Status Lookup Card</span>

- Shown in reply to `@RGMC IT Bot ticket IT-XXXXX`
- Full fact set: status, priority, reporter, assignee, submission time, resolved time, resolution notes

### <span style="color:#555">Priority & status color mapping</span>

| Priority | Adaptive Card color |
|---|---|
| `critical` | `attention` (red) |
| `high` | `warning` (orange) |
| `medium` | `accent` (blue) |
| `low` | `good` (green) |

| Status | Adaptive Card color |
|---|---|
| `pending` | `accent` |
| `in_progress` | `warning` |
| `resolved` | `good` |
| `closed` | `default` |

---

## <span style="color:#A07320">📊 Data Model</span>

### <span style="color:#2a9d8f">Ticket (maps to `issues` table in Supabase)</span>

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Primary key |
| `ticket_number` | `string \| null` | Auto-generated (e.g. `IT-00042`) |
| `title` | `string \| null` | Short title |
| `description` | `string` | Full problem description |
| `status` | `string` | `pending` / `in_progress` / `resolved` / `closed` |
| `priority` | `string \| null` | `low` / `medium` / `high` / `critical` |
| `urgency` | `string \| null` | Urgency level |
| `assigned_to` | `string \| null` | Assignee username |
| `employee_name` | `string` | Reporter's full name |
| `company_name` | `string` | Reporter's company |
| `department` | `string` | Reporter's department |
| `site_name` | `string` | System or site affected |
| `ticket_type` | `string \| null` | `incident` / `service_request` / `change_request` |
| `request_category` | `string \| null` | Category within type |
| `email` | `string` | Reporter's email |
| `from_helpdesk` | `boolean` | Whether submitted via helpdesk form |
| `created_at` | `string` (ISO) | Creation timestamp |
| `resolved_at` | `string \| null` | Resolution timestamp |
| `resolution_notes` | `string \| null` | Resolution details |
| `resolved_by` | `string \| null` | Username of resolver |

### <span style="color:#2a9d8f">BotSubscription (maps to `bot_subscriptions` table)</span>

| Field | Type | Description |
|---|---|---|
| `id` | `string` (UUID) | Primary key |
| `channel_id` | `string` | Teams channel ID — unique per subscription |
| `service_url` | `string` | Bot Framework service URL (region-specific) |
| `conversation_ref` | `object` (JSONB) | Full `ConversationReference` for proactive messaging |
| `tenant_id` | `string \| null` | Azure tenant ID |
| `team_id` | `string \| null` | Teams team ID |
| `channel_name` | `string \| null` | Human-readable channel name |
| `registration_code` | `string` | Code used to register |
| `priority_filter` | `string[] \| null` | `null` = no filter; array = allowlist |
| `type_filter` | `string[] \| null` | `null` = no filter; array = allowlist |
| `notify_created` | `boolean` | Send on ticket creation |
| `notify_updated` | `boolean` | Send on ticket update |
| `notify_resolved` | `boolean` | Send on ticket resolution |

### <span style="color:#2a9d8f">RegistrationCode (maps to `bot_registration_codes` table)</span>

| Field | Type | Description |
|---|---|---|
| `code` | `string` | 8-char alphanumeric code (PK) — uppercase, no ambiguous chars |
| `label` | `string \| null` | Human-readable label for the code |
| `used` | `boolean` | Whether the code has been redeemed |
| `used_by_channel` | `string \| null` | Channel ID that redeemed this code |
| `created_at` | `string` (ISO) | When the code was generated |
| `expires_at` | `string \| null` | Optional expiry timestamp |

### <span style="color:#2a9d8f">NotifyTicketPayload (webhook request body)</span>

| Field | Type | Description |
|---|---|---|
| `event` | `"ticket.created" \| "ticket.updated"` | Event type |
| `ticket` | `Ticket` | Full ticket object |
| `changes` | `TicketChanges \| undefined` | Field-level changes for update events |

`TicketChanges` is a dictionary where each key is a field name and the value is `{ from: string | null, to: string | null }`.

---

## <span style="color:#A07320">📄 License</span>

Private — RGMC Group internal use only. All rights reserved.

---

<div align="center">
<sub>Built for the RGMC IT Department • Bot Framework v4 + Supabase + Microsoft Teams</sub>
</div>

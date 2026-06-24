# Handoff

## Goal

Extend the RGMC IT Teams bot (`C:\claude\rgmc-it-bot`) with database query commands that hit the `rgmc-gcp-api` (`C:\RGMC\Source\git\rgmc-gcp-api`). Users can query MSSQL databases and BigQuery through natural Teams chat commands. Results render as an expandable Adaptive Card table — first 5 rows visible, remaining rows toggled in-place. The bot also auto-detects any valid database name as a command (generic pattern), so no code changes are needed when new databases are added to `mappings.py`.

End state: all commands working in prod Teams, `travel_expense_prod` access granted to the SQL login, GCP API changes deployed.

---

## Current State

### Bot (`C:\claude\rgmc-it-bot`) — ✅ All committed, clean

Last commit: `aa9b60d added connection changes`

All new features are implemented and TypeScript compiles clean (`npx tsc --noEmit` passes).

**Working commands:**
- `bigquery <table> <col> <val>` → `GET /bigquery_routes/by_table/value`
- `bigquery latest <table> <datecol>` → `GET /bigquery_routes/by_table/latest`
- `<db_name> <table> <col> <val>` → `GET /{db_name}/by_table/value` (generic — any valid db_mappings key)
- `<db_name> latest <table> <datecol> [numrows]` → `GET /{db_name}/by_table/latest`
- Optional Filipino prefix phrases `may pumasok ba sa` / `may pumasok ba ngayon sa` are stripped before command parsing

**Adaptive Card table features:**
- MAX_PREVIEW_ROWS = 5 (always visible), MAX_PREVIEW_COLS = 5, MAX_TOTAL_ROWS = 15
- Hidden rows use `Action.ToggleVisibility` with IDs `qr-row-{i}`
- Full values shown (`wrap: true`, no truncation), zebra-striped rows (alternating Container `style`)
- Row count badge in header; "showing first N of M" when capped at 15
- 404 db-not-found → lists valid names; 403 access denied → friendly Filipino message

**Error handling typed:**
- `GcpAccessError` (HTTP 403) → `🔒 Access denied — ang SQL login ay walang permission...`
- `GcpNotFoundError` (HTTP 404) → lists valid db names from mappings
- Generic fallback → raw error message

### GCP API (`C:\RGMC\Source\git\rgmc-gcp-api`) — ⚠️ Uncommitted changes

Last commit: `cb87a3d added mapping changes`

`src/routers/mssql_routes/mssql_routes.py` was modified this session but **not committed**. The change adds `_handle_db_error()` and `_invalidate_engine()`.

**Outstanding blocker:** The SQL Server login used in production (`MSSQL_USER` env var = `sqlserver`) does not have access to `travel_expense_prod` (mapped from the command `travelandexpense`). This causes an error when querying that database. The GCP API now correctly surfaces it as HTTP 403, but the underlying DB permission must be fixed by a DBA.

---

## Files Actively Being Edited

### Bot (`C:\claude\rgmc-it-bot`) — all committed

- `src/bot.ts` — Added `QUERY_PREFIX` static regex; `origArgs` (original-case); `case 'bigquery':` handler; generic `<db_name>` handler in `default:` (3+ arg threshold); `gcpErrorMessage()` typed error helper; new imports for GCP service and query card
- `src/services/gcpService.ts` — **New file.** Exports `GcpAccessError`, `GcpNotFoundError`, `bigqueryByValue`, `bigqueryLatest`, `dbByValue`, `dbLatest`. Uses native `fetch` (Node 22). Parses JSON `detail` field. Throws typed errors on 403/404.
- `src/cards/queryResultCard.ts` — **New file.** Adaptive Card v1.4 table with ColumnSet rows, zebra containers, `Action.ToggleVisibility` for hidden rows. No truncation. MAX_TOTAL_ROWS=15.
- `src/config.ts` — Added `gcpApiUrl: process.env.GCP_API_URL || ''`

### GCP API (`C:\RGMC\Source\git\rgmc-gcp-api`) — **not committed**

- `src/routers/mssql_routes/mssql_routes.py` — Added `_invalidate_engine(db_name)` to evict broken cached engines on failure; added `_handle_db_error(db_name, e)` that detects `Login failed`/`Cannot open database` in the error string and returns HTTP 403 with a DBA instruction message instead of a raw HTTP 500.

---

## Failed Attempts

- **`{ type: 'Separator' }` as Adaptive Card body element** — **Why it failed**: Not a valid Adaptive Card element; Teams rejected the entire payload with "unsupported card element". Fixed by setting `separator: true` on the first data row's Container.

- **`wrap: false` + truncating values to 22 chars** — **Why it failed**: Values displayed with "..." and were unreadable. Removed the `cell()` function entirely; now `wrap: true` on all data TextBlocks.

- **`MAX_TOTAL_ROWS = 200`** — **Why it failed**: ~130KB card payload, over Teams' ~28KB limit. Error: "Message size too large". Fixed by reducing to 15.

- **SBIC as a hardcoded `case 'sbic':` command** — Removed; replaced by the generic `default:` handler. The GCP API endpoint changed from `/sbic/by_table/value` to `/{db_name}/by_table/value`.

- **Querying `travelandexpense` db** — **Why it failed**: SQL Server `sqlserver` login lacks access on `travel_expense_prod`. Error: `Cannot open database "travel_expense_prod" requested by the login. Login failed for user 'sqlserver'`. DBA task required.

---

## Next Step

**Commit the GCP API changes, then fix the SQL Server permission:**

1. Commit the `mssql_routes.py` fix in the GCP API repo:
   ```
   cd C:\RGMC\Source\git\rgmc-gcp-api
   git add src/routers/mssql_routes/mssql_routes.py
   git commit -m "improved db error handling — 403 on permission denied, engine cache invalidation"
   ```

2. Have a DBA run this on the production SQL Server to unblock `travelandexpense` queries:
   ```sql
   USE [travel_expense_prod];
   CREATE USER [sqlserver] FOR LOGIN [sqlserver];
   ALTER ROLE [db_datareader] ADD MEMBER [sqlserver];
   ```
   > Verify the physical DB name first — `mappings.py` currently maps `travelandexpense` → `travel_expense_prod`. During the session the error message mentioned `travel_and_expense_prod` (with `_and_`). Check current `db_mappings` in `src/mappings.py` line 6 before running.

3. Deploy the GCP API to Cloud Run after commit so the 403 error handling is live.

---

## Context & Gotchas

**Bot env var required:** `GCP_API_URL` must be set to the base URL of the GCP API (no trailing slash). Without it, all GCP commands throw "GCP_API_URL is not configured" immediately.

**Valid `db_name` command keywords (from `mappings.py`):**
```
sbic             → sbic_prod
tradeportal      → trade_portal_prod
travelandexpense → travel_expense_prod   ← verify physical name
creative         → creative_prod
accounting       → accounting_prod
production       → production_prod
masterfile       → masterfile_prod
```

**Bot `default:` case is the generic DB handler.** Any command that isn't a known keyword (register, unregister, ticket, configure, status, ask, gumagana, anong, vibe, help, bigquery) AND has 3+ args is forwarded to the GCP API as `/{command}/by_table/value`. Typos with 3+ args hit the GCP API and return 404 (listing valid db names) rather than the help card.

**Teams Adaptive Card size limit is ~28KB.** `MAX_TOTAL_ROWS = 15` in `src/cards/queryResultCard.ts:6`. With untruncated long-text values (descriptions, notes), rows can exceed the 650B/row estimate. If size errors return, reduce this constant.

**`Action.ToggleVisibility` IDs are `qr-row-0`, `qr-row-1`, ...** These target the hidden Container elements in the card body. ID stability is per-render; no issue since the bot doesn't update cards after sending.

**Original-case args split:** `bot.ts` keeps two arg arrays — `args` (lowercased, for keyword matching like `'latest'`) and `origArgs` (original case, for passing table/column/value names to the API). This matters because SQL Server table and column names can be case-sensitive in some collations.

**GCP API engine cache:** `_engines` dict in `mssql_routes.py` is module-level, persists per Cloud Run instance. Permission failures now call `_invalidate_engine()` so the next request tries fresh. Other failures (bad table name, SQL error) do NOT invalidate the engine.

**Node version:** Project targets Node 22 (`@types/node: ^22.0.0`). Native `fetch` is used in `gcpService.ts` — no axios in `package.json`, none needed.

**`sbic` command removed as explicit case.** Users type `sbic <table> <col> <val>` and the `default:` generic handler routes it. Behavior is identical to before, routing path changed from `/sbic/by_table/*` to `/{db_name}/by_table/*`.

**The `bigquery` command keeps its own explicit `case 'bigquery':`** and hits `/bigquery_routes/by_table/*` — different path prefix from the MSSQL generic routes. Do not change this.

-- RGMC IT Bot — Supabase Tables
-- Run in: Supabase Dashboard → SQL Editor → New Query → paste & run
-- Uses the same Supabase project as rgmc-gateway.

-- ─────────────────────────────────────────────────────────────────────────────
-- Registration codes
-- Admin generates codes; Teams users redeem them to subscribe a channel.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_registration_codes (
    code            TEXT        PRIMARY KEY,
    label           TEXT,
    used            BOOLEAN     NOT NULL DEFAULT false,
    used_by_channel TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ
);

ALTER TABLE public.bot_registration_codes ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- Channel subscriptions
-- One row per registered Teams channel.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_subscriptions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Teams identifiers
    channel_id          TEXT        NOT NULL UNIQUE,   -- teamsChannelId or conversation.id
    service_url         TEXT        NOT NULL,
    conversation_ref    JSONB       NOT NULL,           -- full ConversationReference for proactive messages
    tenant_id           TEXT,
    team_id             TEXT,
    channel_name        TEXT,

    -- Registration
    registration_code   TEXT        NOT NULL,

    -- Notification filters (NULL = no filter = receive all)
    priority_filter     TEXT[],    -- e.g. ['high','critical']
    type_filter         TEXT[],    -- e.g. ['incident']
    department_filter   TEXT,      -- e.g. 'IT' (matches issues.department or a substring of assigned_to)
    category_filter     TEXT,      -- e.g. 'Software/Application' (matches issues.request_category)

    -- Event toggles
    notify_created      BOOLEAN     NOT NULL DEFAULT true,
    notify_updated      BOOLEAN     NOT NULL DEFAULT true,
    notify_resolved     BOOLEAN     NOT NULL DEFAULT true,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_subs_channel_id ON public.bot_subscriptions (channel_id);
CREATE INDEX IF NOT EXISTS idx_bot_subs_team_id    ON public.bot_subscriptions (team_id);

ALTER TABLE public.bot_subscriptions ENABLE ROW LEVEL SECURITY;

-- Safe to re-run against an existing table created before these columns existed.
ALTER TABLE public.bot_subscriptions ADD COLUMN IF NOT EXISTS department_filter TEXT;
ALTER TABLE public.bot_subscriptions ADD COLUMN IF NOT EXISTS category_filter   TEXT;


-- ─────────────────────────────────────────────────────────────────────────────
-- PO upload subscriptions
-- One row per Teams channel subscribed to rgmc-worker-pool's POUL SO import
-- notifications (po-all / po-bc / po-buffer) — a separate notification group
-- from ticket subscriptions above, since a channel may want PO alerts without
-- wanting IT ticket alerts (or vice versa).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.po_upload_subscriptions (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Teams identifiers
    channel_id          TEXT        NOT NULL UNIQUE,
    service_url         TEXT        NOT NULL,
    conversation_ref    JSONB       NOT NULL,
    tenant_id           TEXT,
    team_id             TEXT,
    channel_name        TEXT,

    -- Event toggles — po-all sets both true; po-bc/po-buffer set one at a time.
    notify_po_bc        BOOLEAN     NOT NULL DEFAULT true,   -- at least one order reached BC
    notify_po_buffer     BOOLEAN     NOT NULL DEFAULT true,   -- at least one PO couldn't resolve, buffered for /reconcile

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_po_upload_subs_channel_id ON public.po_upload_subscriptions (channel_id);

ALTER TABLE public.po_upload_subscriptions ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- Per-user links
-- One row per RGMC user who has linked a personal (1:1) chat with the bot.
-- Used to DM a specific user — @mentions and issue/dev item/task assignments —
-- instead of posting to a shared channel.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bot_user_links (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    username            TEXT        NOT NULL UNIQUE,   -- rgmc-gateway users.username
    email               TEXT,
    aad_object_id       TEXT,

    -- Teams identifiers for the 1:1 conversation
    service_url         TEXT        NOT NULL,
    conversation_ref    JSONB       NOT NULL,           -- full ConversationReference for proactive messages
    tenant_id           TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_user_links_username ON public.bot_user_links (username);

ALTER TABLE public.bot_user_links ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- issues table additions
-- These columns are expected by the bot's ticket status card.
-- If the issues table was created by rgmc-gateway's supabase_setup.sql,
-- run these ALTER statements to add any missing columns.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS ticket_number   TEXT UNIQUE;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS title           TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS priority        TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS urgency         TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS ticket_type     TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS request_category    TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS request_subcategory TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS assigned_to     TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS resolved_by     TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS resolved_at     TIMESTAMPTZ;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS from_helpdesk   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS anydesk_id      TEXT;
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS attachment_urls TEXT[];
ALTER TABLE public.issues ADD COLUMN IF NOT EXISTS dev_item_id     UUID;

-- Auto-generate ticket_number on insert — format "TIM-yymmdd##", where the
-- 2-digit series resets to 00 at the start of each day (Asia/Manila time).
-- Kept in sync with rgmc-gateway's own tim_ticket_number_migration.sql —
-- both repos share the same issues table, so this must match production.
CREATE TABLE IF NOT EXISTS public.tim_ticket_counters (
    ticket_date DATE PRIMARY KEY,
    last_seq    INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION public.generate_tim_ticket_number()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  today DATE := (timezone('Asia/Manila', now()))::date;
  seq   INTEGER;
BEGIN
  INSERT INTO public.tim_ticket_counters (ticket_date, last_seq)
  VALUES (today, 0)
  ON CONFLICT (ticket_date) DO NOTHING;

  UPDATE public.tim_ticket_counters
  SET last_seq = last_seq + 1
  WHERE ticket_date = today
  RETURNING last_seq INTO seq;

  RETURN 'TIM-' || to_char(today, 'YYMMDD') || lpad((seq - 1)::text, 2, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := public.generate_tim_ticket_number();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_ticket_number ON public.issues;
CREATE TRIGGER trg_set_ticket_number
    BEFORE INSERT ON public.issues
    FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();

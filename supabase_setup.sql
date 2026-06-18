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

-- Auto-generate ticket_number on insert (e.g. IT-00001)
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START 1;

CREATE OR REPLACE FUNCTION public.set_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.ticket_number IS NULL THEN
        NEW.ticket_number := 'IT-' || LPAD(nextval('public.ticket_number_seq')::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_ticket_number ON public.issues;
CREATE TRIGGER trg_set_ticket_number
    BEFORE INSERT ON public.issues
    FOR EACH ROW EXECUTE FUNCTION public.set_ticket_number();

-- Migration 183: D38 first-response request engine (Ken 2026-10-13). Additive only.
--
-- Ken's human-audit notes: a request reaches every matching provider, the
-- first provider to respond with a quote takes it, the customer accepts or
-- declines, and a declined request goes back out to other providers with a
-- signal that the customer declined. This migration adds the columns and the
-- invite record that engine needs. Plan: qa-frameworks/human-audit-2026-10-13/
-- merged.md section 1, with the critique.md section 1 corrections (bookings
-- client_request_id for job-request idempotency, invite quote_id ON DELETE
-- CASCADE, IF NOT EXISTS on every CREATE).
--
--   bookings        request round, back-office review flag, "budget not sure",
--                   the provider-proposed time window, and the customer's
--                   idempotency key for POST /bookings/job-request.
--   booking_quotes  round, "could change if", earliest date and window, the
--                   accept-the-budget flag, the provider's idempotency key and
--                   the customer's decline reason. A decline without
--                   declined_at is a "not selected" sibling decline.
--   job_request_invites  every provider told about (or who opened) a request,
--                   per round, with sent / viewed / responded times. Feeds the
--                   Milestone 3 admin insights.
--   platform_settings    seven admin controls under provider / requests.
--
-- Data safety: every new column is nullable or has a constant default, so no
-- table is rewritten. Every new CHECK already holds for every existing row
-- (old declined quotes have no decline_reason, fixed-price rows keep the
-- defaults). Nothing is dropped or renamed. Settings rows use ON CONFLICT DO
-- NOTHING, so an operator's value is never overwritten.
--
-- The migration refuses to run while any provider holds two quotes on the
-- same request (the new unique index would fail anyway; the DO block names the
-- problem). Run the read-only pre-check in merged.md section 7 on live first.
-- No BEGIN/COMMIT: run-reviewed-migrations.mjs applies it in one transaction.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS budget_unknown BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS request_round SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS request_round_opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS request_declined_rounds SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_ops_review_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS request_ops_review_reason VARCHAR(30),
  ADD COLUMN IF NOT EXISTS request_still_looking_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_window VARCHAR(10);
ALTER TABLE bookings
  ADD CONSTRAINT bookings_request_round_check CHECK (request_round BETWEEN 1 AND 50),
  ADD CONSTRAINT bookings_request_declined_rounds_check CHECK (request_declined_rounds BETWEEN 0 AND 50),
  ADD CONSTRAINT bookings_request_ops_review_check CHECK (
    (request_ops_review_at IS NULL) = (request_ops_review_reason IS NULL)
    AND (request_ops_review_reason IS NULL
         OR request_ops_review_reason IN ('max_rounds','no_eligible_providers'))),
  ADD CONSTRAINT bookings_budget_unknown_check CHECK (NOT budget_unknown
    OR (booking_type = 'quote_based' AND budget_min IS NULL AND budget_max IS NULL)),
  ADD CONSTRAINT bookings_request_fields_quote_only CHECK (booking_type = 'quote_based'
    OR (request_round = 1 AND request_declined_rounds = 0 AND request_ops_review_at IS NULL)),
  ADD CONSTRAINT bookings_scheduled_window_check CHECK (scheduled_window IS NULL
    OR scheduled_window IN ('morning','afternoon','evening','asap'));

-- Idempotency key for POST /api/v1/bookings/job-request (critique M9): a double
-- tap with the same key returns the first request instead of a second one.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_customer_client_request
  ON bookings (customer_id, client_request_id) WHERE client_request_id IS NOT NULL;

ALTER TABLE booking_quotes
  ADD COLUMN IF NOT EXISTS round SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS could_change_if TEXT,
  ADD COLUMN IF NOT EXISTS earliest_date DATE,                 -- Asia/Manila calendar date
  ADD COLUMN IF NOT EXISTS earliest_time_window VARCHAR(10),
  ADD COLUMN IF NOT EXISTS accepted_customer_budget BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS client_request_id UUID,
  ADD COLUMN IF NOT EXISTS decline_reason VARCHAR(20),
  ADD COLUMN IF NOT EXISTS decline_note TEXT,
  ADD COLUMN IF NOT EXISTS declined_at TIMESTAMPTZ;           -- set only by a customer decline
ALTER TABLE booking_quotes
  ADD CONSTRAINT booking_quotes_round_check CHECK (round BETWEEN 1 AND 50),
  ADD CONSTRAINT booking_quotes_could_change_if_check
    CHECK (could_change_if IS NULL OR char_length(could_change_if) <= 300),
  ADD CONSTRAINT booking_quotes_earliest_window_check CHECK (earliest_time_window IS NULL
    OR earliest_time_window IN ('morning','afternoon','evening','asap')),
  ADD CONSTRAINT booking_quotes_earliest_pair_check
    CHECK ((earliest_date IS NULL) = (earliest_time_window IS NULL)),
  ADD CONSTRAINT booking_quotes_decline_reason_check CHECK (decline_reason IS NULL
    OR decline_reason IN ('too_expensive','timing','changed_mind','other')),
  ADD CONSTRAINT booking_quotes_decline_note_check CHECK (decline_note IS NULL
    OR (decline_reason IS NOT NULL AND char_length(decline_note) <= 300)),
  ADD CONSTRAINT booking_quotes_customer_decline_check CHECK (
    (declined_at IS NULL) = (decline_reason IS NULL)
    AND (declined_at IS NULL OR status = 'declined'));

-- One quote per provider per request (brief); fail closed, never auto-delete.
DO $m183_dupes$ BEGIN
  IF EXISTS (SELECT 1 FROM booking_quotes GROUP BY booking_id, provider_id HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Migration 183: duplicate (booking_id, provider_id) quotes exist; resolve by hand first.';
  END IF;
END $m183_dupes$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_booking_quotes_booking_provider ON booking_quotes (booking_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_booking_quotes_live ON booking_quotes (booking_id) WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS idx_booking_quotes_provider_recent ON booking_quotes (provider_id, created_at DESC);

-- Every provider told about (or who opened) a request, per round.
-- quote_id cascades (critique L6): a quoted invite must keep a quote_id, so a
-- deleted quote removes its invite instead of breaking that CHECK.
CREATE TABLE IF NOT EXISTS job_request_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  round SMALLINT NOT NULL CHECK (round BETWEEN 1 AND 50),
  source VARCHAR(10) NOT NULL DEFAULT 'push' CHECK (source IN ('push','inbox')),
  rank SMALLINT CHECK (rank >= 1),
  score NUMERIC(5,3),
  distance_km NUMERIC(7,2),
  status VARCHAR(10) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','viewed','quoted','declined','taken','expired','passed')),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  quote_id UUID REFERENCES booking_quotes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id, provider_id, round),
  CHECK (status <> 'quoted' OR (responded_at IS NOT NULL AND quote_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_jri_booking_round ON job_request_invites (booking_id, round);
CREATE INDEX IF NOT EXISTS idx_jri_provider_recent ON job_request_invites (provider_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_jri_open ON job_request_invites (sent_at) WHERE status IN ('sent','viewed');

-- SETTING_DEFAULTS in settings.service.ts carries the same keys and defaults,
-- so the boot-time drift check stays clean.
INSERT INTO platform_settings (category, subcategory, key, label, description, value_type,
  value, default_value, min_value, max_value, unit, display_order, is_active) VALUES
 ('provider','requests','request_max_open_quotes','Open quotes per request',
  'How many providers can hold a live quote on one request at once. Declined, withdrawn and expired quotes do not count. 1 = first pro to respond gets the request; 5 = customer compares up to five.',
  'integer','1','1',1,20,'quotes',20,TRUE),
 ('provider','requests','request_max_rounds','Declines before back-office review',
  'After this many rounds in which the customer declined every quote on one request, it is flagged for the back office instead of being sent out again.',
  'integer','3','3',1,10,'rounds',21,TRUE),
 ('provider','requests','request_max_invites','Providers notified per round',
  'Most providers notified per round, best match first. Other eligible providers still see the request in their Requests list.',
  'integer','30','30',1,200,'providers',22,TRUE),
 ('provider','requests','request_show_declined_amount','Show declined amount to other providers',
  'When on, providers told about a reopened request also see the amount the customer declined. Off so earlier prices do not anchor new quotes.',
  'boolean','false','false',NULL,NULL,NULL,23,TRUE),
 ('provider','requests','request_provider_poll_seconds','Request list refresh when offline',
  'How often provider Requests screens and the customer request screen re-check while the live connection is down. Works without phone push.',
  'integer','30','30',15,120,'seconds',24,TRUE),
 ('provider','requests','request_customer_still_looking_minutes','Still-looking notice',
  'Minutes with no quote before the customer sees "Still looking for a pro" and gets one in-app notice.',
  'integer','30','30',10,240,'minutes',25,TRUE),
 ('provider','requests','request_slot_lead_minutes','Quote slot lead time',
  'When a customer confirms a quote, the job time is the start of the provider''s time window, but never earlier than this many minutes after confirmation. ASAP quotes start this many minutes after confirmation.',
  'integer','60','60',15,240,'minutes',26,TRUE)
ON CONFLICT (key) DO NOTHING;

UPDATE platform_settings
   SET description = 'Retired by D38: the live limit is request_max_open_quotes. Kept for history; not read by quote admission.'
 WHERE key = 'max_quotes_per_booking';

-- Migration 186: back-office marketplace alerts (D38 Milestone 3, Ken 2026-10-13). Additive only.
--
-- Ken's human-audit notes: show insights for every service request where a
-- customer asked for help and no one responded, and alert the back office when
-- a service pro takes more than 5 to 10 minutes to respond, so the team can
-- call providers, recruit faster ones or add more. Plan: qa-frameworks/
-- human-audit-2026-10-13/merged.md section 1 (this SQL) and design-admin.md,
-- with the critique.md IF NOT EXISTS correction (re-running the file is a
-- no-op).
--
--   marketplace_alerts  one row per (request, kind, round), written only by
--                   the one-minute sweep (marketplace-alert.service.ts) and
--                   by an admin acknowledging it. Kinds:
--                     request_waiting_amber / request_waiting_red  a quote
--                       request with no live quote this many minutes after
--                       its round opened (the request's
--                       COALESCE(request_round_opened_at, created_at)), or
--                       after the round's last quote lapsed if that is
--                       later (anchor_at, when the measured wait began);
--                     request_needs_ops  the engine flagged the request for
--                       back-office review (bookings.request_ops_review_at);
--                     request_unfilled  the request closed with no quote.
--                   The unique key includes the round, so a request a
--                   customer decline reopened alerts again in its new round,
--                   but the same round never alerts twice.
--                   Alerts are read-only insight: they never contact a
--                   provider, change a request, quote or invite, or feed
--                   ranking, matching or quality scores (E33, E47).
--   platform_settings  three admin controls under dispatch / request_alerts.
--                   SETTING_DEFAULTS in settings.service.ts carries the same
--                   keys and defaults. ON CONFLICT DO NOTHING keeps an
--                   operator's value.
--
-- Acknowledging an alert is audit-logged as marketplace_alert_acknowledged
-- with target_type 'booking' (already allowed since 014), so it also shows in
-- Booking 360's audit history. The name is appended to
-- admin_actions_action_type_check with the two-anchor splice from migration
-- 171, which accepts both stored forms of that constraint and adds nothing
-- when the name is already present.
--
-- Data safety: one new table, two indexes on it, one partial index on
-- bookings, three settings rows. Nothing existing is changed, dropped or
-- renamed.
-- No BEGIN/COMMIT: run-reviewed-migrations.mjs applies it in one transaction.

CREATE TABLE IF NOT EXISTS marketplace_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('request_waiting_amber','request_waiting_red','request_needs_ops','request_unfilled')),
  request_round SMALLINT NOT NULL CHECK (request_round BETWEEN 1 AND 50),
  anchor_at TIMESTAMPTZ NOT NULL,     -- the round opening (COALESCE(request_round_opened_at, created_at)); for a waiting alert, the round's last quote lapse if later
  threshold_minutes SMALLINT CHECK (threshold_minutes BETWEEN 1 AND 1440),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  raised_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution TEXT CHECK (resolution IN ('quote_received','quote_accepted','escalated','reopened','booking_closed','acknowledged','aged_out')),
  CONSTRAINT marketplace_alerts_once_per_round UNIQUE (booking_id, kind, request_round),
  CONSTRAINT marketplace_alerts_ack_pair CHECK (acknowledged_by IS NULL OR acknowledged_at IS NOT NULL),
  CONSTRAINT marketplace_alerts_resolution_pair CHECK ((resolved_at IS NULL) = (resolution IS NULL)),
  CONSTRAINT marketplace_alerts_threshold_kind CHECK (
    (kind IN ('request_waiting_amber','request_waiting_red')) = (threshold_minutes IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_marketplace_alerts_open ON marketplace_alerts (raised_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_marketplace_alerts_booking ON marketplace_alerts (booking_id, raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_open_quote_requests ON bookings (created_at)
  WHERE booking_type = 'quote_based' AND status IN ('requested','quoted');

INSERT INTO platform_settings (category, subcategory, key, label, description, value_type,
  value, default_value, min_value, max_value, unit, display_order, is_active) VALUES
 ('dispatch','request_alerts','ops_request_alert_amber_minutes','Request alert: amber after','Minutes a request may wait with no live quote, since it opened or reopened, before an amber back-office alert. Alerts never contact providers or change the request.','integer','5','5',1,120,'minutes',120,TRUE),
 ('dispatch','request_alerts','ops_request_alert_red_minutes','Request alert: red after','Minutes with no live quote before a red alert (and Slack when configured). If not above amber, amber + 1 is used.','integer','10','10',2,240,'minutes',121,TRUE),
 ('dispatch','request_alerts','ops_coverage_min_responsive_providers','Coverage: responsive providers needed','An area and category shows red on the coverage grid when fewer approved providers than this sent a quote in the last 7 days. Display only.','integer','3','3',1,50,'providers',122,TRUE)
ON CONFLICT (key) DO NOTHING;

DO $migration_186_action$
DECLARE current_def TEXT; appendage TEXT; missing_verbs TEXT[] := ARRAY['marketplace_alert_acknowledged'];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def FROM pg_constraint
   WHERE conname = 'admin_actions_action_type_check' AND conrelid = 'admin_actions'::regclass;
  IF current_def IS NULL THEN RAISE EXCEPTION 'admin_actions_action_type_check not found.'; END IF;
  SELECT string_agg(format('(%L::character varying)::text', item.value), ', ') INTO appendage
    FROM unnest(missing_verbs) AS item(value)
   WHERE position('''' || item.value || '''::character varying' IN current_def) = 0;
  IF appendage IS NOT NULL THEN
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    IF current_def ~ '\]\)::text\[\]\)\)\)$' THEN
      EXECUTE format('ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
        regexp_replace(current_def, '\]\)::text\[\]\)\)\)$', ', ' || appendage || '])::text[])))'));
    ELSE
      EXECUTE format('ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
        regexp_replace(current_def, '\]\)\)\)$', ', ' || appendage || '])))'));
    END IF;
  END IF;
END $migration_186_action$;

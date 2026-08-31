-- Phase 14 Dispatch 08 — Bug 969.
-- Granular per-channel marketing consent flags.
--
-- Pre-D08 the table had a single `promotions` BOOLEAN; the marketing
-- worker didn't query it. This migration:
-- 1. Adds explicit per-channel flags (push/SMS/email).
-- 2. Adds marketing_consent_acknowledged_at + version as durable internal consent evidence.
-- 3. Backfills the new flags from the existing `promotions` boolean.
--
-- The marketing service (sendMarketingPush/Sms/Email) checks BOTH the
-- per-channel flag AND `marketing_consent_acknowledged_at IS NOT NULL`
-- before adding a user to a campaign audience.

BEGIN;

ALTER TABLE notification_preferences
    ADD COLUMN IF NOT EXISTS marketing_push_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS marketing_sms_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS marketing_email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS marketing_consent_acknowledged_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS marketing_consent_version INTEGER;

-- Backfill from the existing single boolean. promotions=TRUE means the
-- user opted into all channels at the legacy un-granular level.
UPDATE notification_preferences
   SET marketing_push_enabled = COALESCE(promotions, FALSE),
       marketing_email_enabled = COALESCE(promotions, FALSE)
 WHERE marketing_push_enabled = FALSE AND marketing_email_enabled = FALSE;
-- SMS stays FALSE by default — opt-in to SMS marketing requires explicit
-- consent (TIN/NPC tighter rules). The user re-consents via the granular
-- toggles in the next mobile/admin polish dispatch (D11).

CREATE INDEX IF NOT EXISTS idx_notif_pref_marketing_push
    ON notification_preferences(user_id)
    WHERE marketing_push_enabled = TRUE
      AND marketing_consent_acknowledged_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notif_pref_marketing_sms
    ON notification_preferences(user_id)
    WHERE marketing_sms_enabled = TRUE
      AND marketing_consent_acknowledged_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notif_pref_marketing_email
    ON notification_preferences(user_id)
    WHERE marketing_email_enabled = TRUE
      AND marketing_consent_acknowledged_at IS NOT NULL;

COMMIT;

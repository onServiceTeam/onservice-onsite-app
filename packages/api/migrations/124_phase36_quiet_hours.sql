-- Phase 36a — Quiet hours support for notification_preferences.
--
-- Adds opt-in quiet-hours window per user. When enabled, push delivery
-- (deliverPushToDevice) is suppressed during the window — but the
-- notification ROW is still written to `notifications` so the user
-- sees the message when they next open the app. Bypassed for high-
-- priority types (payment-confirmed, booking-cancelled) so customers
-- aren't left wondering whether their card was charged.
--
-- Storage:
--   - quiet_hours_enabled BOOL: master toggle (default FALSE)
--   - quiet_hours_start / quiet_hours_end TIME: window endpoints in
--     LOCAL time. Window is start..end same-day when start <= end, or
--     wraps midnight when start > end (e.g., 22:00..07:00).
--   - quiet_hours_timezone TEXT: IANA timezone name (default
--     'Asia/Manila' — the only TZ we serve at launch). Stored for
--     v1.1 multi-region readiness.

BEGIN;

ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS quiet_hours_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS quiet_hours_start    TIME        NOT NULL DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_end      TIME        NOT NULL DEFAULT '07:00',
  ADD COLUMN IF NOT EXISTS quiet_hours_timezone TEXT        NOT NULL DEFAULT 'Asia/Manila';

-- Sanity CHECK: timezone string non-empty.
ALTER TABLE notification_preferences
  ADD CONSTRAINT quiet_hours_tz_nonempty CHECK (length(quiet_hours_timezone) > 0);

COMMIT;

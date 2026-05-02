-- Migration 094: Add `preferred_locale` to users for notification i18n.
-- MED-N58 fix.
--
-- Pre-fix: notification.service.notifyBookingStatusChange used a
-- hardcoded English statusMessages map. Tagalog/Filipino-speaking
-- providers and customers received English-only push + in-app
-- notifications even when the rest of the app supported their
-- language (Bug 1170/1198 cancellation policy was already
-- localized but notifications were not).
--
-- Post-fix: users.preferred_locale stores the user's chosen language
-- (default 'en'). notification.service looks it up and routes
-- through i18n.service.translate() before delivering. Mobile UI
-- exposes this as a profile setting.
--
-- Allowed values: 'en' (English) and 'tl' (Filipino/Tagalog) for
-- v1.0 launch. Add more locales by relaxing the CHECK constraint
-- in a future migration plus adding entries to the i18n catalog.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'en'
  CHECK (preferred_locale IN ('en', 'tl'));

COMMENT ON COLUMN users.preferred_locale IS
  'Preferred locale for notifications + emails. en=English, tl=Filipino/Tagalog. Default en. notification.service routes notification bodies through i18n.service.translate() with this value.';

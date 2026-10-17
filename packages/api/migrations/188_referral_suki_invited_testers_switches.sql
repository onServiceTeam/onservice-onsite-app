-- Migration 188: the referral off switch, the Suki off switch and the
-- invited-testers sign-in setting (D41 Q32, Q33 and Q47; Ken approved the
-- recommendations on 2026-10-18). Customer review build program, slice P2.
--
--   referral_program_enabled   false. Referral bonuses stay off. While off,
--                              redeeming a code and the referrer bonus are
--                              refused and no wallet row changes. Read-only
--                              in admin until Ken decides the rules
--                              (settings.service.ts, HELD_SETTING_SUMMARIES).
--   suki_program_enabled       false. Suki stays hidden. While off, Suki
--                              Redeem is refused and no Suki discount is
--                              taken from any price. Read-only in admin while
--                              E25 and D29 are open.
--   invited_testers_only       true. While on, phone sign-in refuses a number
--                              that is not on the server's test-number list,
--                              with the message below, before any code is
--                              made or any text is sent. Off: the normal
--                              sign-in path. Editable in admin.
--   invited_testers_message    The words those people see. Editable in admin
--                              (1 to 200 characters).
--
-- SETTING_DEFAULTS in settings.service.ts carries the same keys and defaults,
-- so the boot-time drift check stays clean and a database outage falls back
-- to the same values (off for both money switches).
--
-- Additive only. ON CONFLICT DO NOTHING keeps an operator's value if a row
-- already exists. No other table or row is read or changed.

INSERT INTO platform_settings (category, subcategory, key, label, description, value_type,
  value, default_value, min_value, max_value, unit, display_order, is_active) VALUES
 ('marketing', 'referral', 'referral_program_enabled', 'Referral bonuses',
  'When on, a customer can enter a friend''s referral code for a wallet bonus. Off until Ken decides the rules (D41 Q32).',
  'boolean', 'false', 'false', NULL, NULL, NULL, 410, TRUE),
 ('loyalty', 'suki', 'suki_program_enabled', 'Suki program',
  'When on, Suki points can be redeemed and Suki discounts apply to bookings. Off while E25 and D29 are open (D41 Q33).',
  'boolean', 'false', 'false', NULL, NULL, NULL, 99, TRUE),
 ('auth', 'sign_in', 'invited_testers_only', 'Invited testers only',
  'When on, phone sign-in works only for the numbers on the server''s test-number list. Everyone else sees the message below and no code is sent (D41 Q47).',
  'boolean', 'true', 'true', NULL, NULL, NULL, 20, TRUE),
 ('auth', 'sign_in', 'invited_testers_message', 'Message for people not invited',
  'Shown on the sign-in screen to a number that is not on the test-number list while "Invited testers only" is on. 1 to 200 characters.',
  'string', 'onService is open to invited testers for now.', 'onService is open to invited testers for now.',
  NULL, NULL, NULL, 21, TRUE)
ON CONFLICT (key) DO NOTHING;

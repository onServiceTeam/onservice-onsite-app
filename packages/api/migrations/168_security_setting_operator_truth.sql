-- Migration 168: align security-control metadata with its deployed consumers.
-- Values are intentionally unchanged. suspicious_ip_threshold already has an
-- effective runtime floor of 10; this closes the Admin form mismatch that
-- previously offered values from 5 to 9 which the worker silently ignored.

BEGIN;

UPDATE platform_settings
SET description = 'Failed OTP and admin sign-in records from one IP during the previous hour before the five-minute security worker creates a 24-hour block.',
    min_value = 10
WHERE key = 'suspicious_ip_threshold';

UPDATE platform_settings
SET description = 'Failed OTP send or verification records before the next OTP-send request requires Cloudflare Turnstile. Phone history uses 24 hours and IP history uses one hour.'
WHERE key = 'captcha_threshold';

COMMIT;

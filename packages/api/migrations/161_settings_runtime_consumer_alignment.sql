-- Migration 161: expose runtime-consumed controls in the authoritative
-- platform settings registry without changing existing behavior.
--
-- The authentication/upload middleware and provider matching engine already
-- read these keys with the fallback values below. Missing rows made those
-- controls invisible to operators and made database/cache reads fall through
-- to code defaults. On conflict, preserve the current operator-selected value
-- while aligning metadata and the outage fallback default.

INSERT INTO platform_settings
  (category, subcategory, key, label, description, value_type,
   value, default_value, min_value, max_value, unit, display_order,
   is_active)
VALUES
  (
    'security', 'authentication', 'auth_rate_limit_window_ms',
    'Authentication Rate-Limit Window',
    'Rolling window used to limit sign-in, registration, OTP, and password-reset attempts.',
    'integer', '60000', '60000', 10000, 3600000, 'milliseconds', 410, TRUE
  ),
  (
    'security', 'authentication', 'auth_rate_limit_max_requests',
    'Authentication Requests per Window',
    'Maximum authentication attempts accepted from one address during the authentication rate-limit window.',
    'integer', '10', '10', 1, 100, 'requests', 411, TRUE
  ),
  (
    'security', 'uploads', 'upload_rate_limit_window_ms',
    'Upload Rate-Limit Window',
    'Rolling window used to limit file-upload requests from one address.',
    'integer', '60000', '60000', 10000, 3600000, 'milliseconds', 420, TRUE
  ),
  (
    'security', 'uploads', 'upload_rate_limit_max_requests',
    'Uploads per Window',
    'Maximum file-upload requests accepted from one address during the upload rate-limit window.',
    'integer', '30', '30', 1, 300, 'requests', 421, TRUE
  ),
  (
    'matching', 'quality', 'matching_min_rating',
    'Minimum Provider Rating',
    'Minimum provider rating required by matching after the review-count threshold is reached.',
    'number', '2.5', '2.5', 0, 5, 'stars', 410, TRUE
  ),
  (
    'matching', 'quality', 'matching_min_rating_reviews',
    'Minimum Reviews Before Rating Filter',
    'Completed-job review count required before the minimum provider rating is enforced by matching.',
    'integer', '5', '5', 1, 100, 'reviews', 411, TRUE
  )
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  subcategory = EXCLUDED.subcategory,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  default_value = EXCLUDED.default_value,
  min_value = EXCLUDED.min_value,
  max_value = EXCLUDED.max_value,
  unit = EXCLUDED.unit,
  display_order = EXCLUDED.display_order,
  is_active = TRUE;

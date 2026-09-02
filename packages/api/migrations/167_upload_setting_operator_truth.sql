-- Migration 167: align upload-control metadata with authoritative consumers.
-- Values are intentionally unchanged. The quota middleware counts by the
-- authenticated user, not address, and supported image formats remain the
-- deployed JPEG/PNG/WebP set rather than an open-ended MIME registry.

BEGIN;

UPDATE platform_settings
SET description = CASE key
  WHEN 'upload_rate_limit_window_ms'
    THEN 'Rolling window shared by authenticated booking-photo, signature, general-upload, and project-image requests from one user.'
  WHEN 'upload_rate_limit_max_requests'
    THEN 'Maximum combined file-upload requests accepted from one authenticated user during the upload rate-limit window.'
  WHEN 'allowed_image_mime_types'
    THEN 'Comma-separated selected subset of image/jpeg, image/png, and image/webp accepted for new image uploads. Adding another format requires a coordinated application release.'
END
WHERE key IN (
  'upload_rate_limit_window_ms',
  'upload_rate_limit_max_requests',
  'allowed_image_mime_types'
);

COMMIT;

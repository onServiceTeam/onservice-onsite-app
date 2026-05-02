-- 110_n144_upload_allowed_mime.sql
--
-- MED-N144 fix — admin-tunable upload allowed MIME types.
-- Pre-fix: upload.service.ts ALLOWED_MIME was built from
-- platformConfig.allowedImageTypes at module-load time; admins
-- couldn't add a new MIME (e.g., image/avif) without a code deploy.
-- Post-fix: validateFile reads from this platform_settings row
-- (comma-separated list).

INSERT INTO platform_settings (key, value, description)
  VALUES (
    'allowed_image_mime_types',
    'image/jpeg,image/png,image/webp',
    'Comma-separated list of MIME types accepted by the upload validator. Admins can add MIMEs (e.g., image/avif) without a code deploy. Falls back to platformConfig.allowedImageTypes if missing or empty.'
  )
ON CONFLICT (key) DO NOTHING;

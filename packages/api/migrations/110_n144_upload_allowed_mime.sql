-- 110_n144_upload_allowed_mime.sql
--
-- MED-N144 fix — admin-tunable upload allowed MIME types.
-- Pre-fix: upload.service.ts ALLOWED_MIME was built from
-- platformConfig.allowedImageTypes at module-load time; admins
-- couldn't add a new MIME (e.g., image/avif) without a code deploy.
-- Post-fix: validateFile reads from this platform_settings row
-- (comma-separated list).

-- CRIT-PHASE16-02h fix — original INSERT omitted required columns.
INSERT INTO platform_settings
  (category, key, label, description, value_type, value, default_value, display_order)
  VALUES (
    'security',
    'allowed_image_mime_types',
    'Allowed Image MIME Types',
    'Comma-separated list of MIME types accepted by the upload validator. Admins can add MIMEs (e.g., image/avif) without a code deploy. Falls back to platformConfig.allowedImageTypes if missing or empty.',
    'string',
    'image/jpeg,image/png,image/webp',
    'image/jpeg,image/png,image/webp',
    100
  )
ON CONFLICT (key) DO NOTHING;

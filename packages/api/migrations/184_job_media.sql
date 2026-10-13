-- Migration 184: private job media for requests and request threads (D38). Additive.
--
-- Ken's human-audit notes: a customer describes a job with photos, a short
-- video and a recorded voice explanation, and the customer and provider
-- message each other. Every file is stored privately and shown only through
-- links that expire. This table tracks each upload from its first chunk to the
-- request (purpose 'job_request') or request thread message (purpose 'chat',
-- photo and voice only) it is attached to. Plan: qa-frameworks/
-- human-audit-2026-10-13/merged.md section 1 and design-media.md section 2,
-- with the critique.md IF NOT EXISTS correction (re-running the file is a
-- no-op).
--
-- bookings.job_photos / job_video_url stay for old rows and old apps.
--
-- The limit_* columns snapshot the admin limits when an upload starts, so an
-- upload already running keeps the limit it started with. 'processing' stops
-- two complete calls handling the same file; 'rejected' with rejection_code
-- tells the app not to retry; purged_at lets the cleanup worker retry a file
-- delete.
--
-- Six admin controls under security / uploads; SETTING_DEFAULTS in
-- settings.service.ts carries the same keys and defaults. ON CONFLICT DO
-- NOTHING keeps an operator's value. job_media_max_photos tops out at 6 (D38:
-- "up to 6 photos"), not the plan draft's 10: POST /bookings/job-request takes
-- at most 8 mediaIds, so 6 photos + 1 video + 1 voice note is the most a
-- request can carry. A higher photo limit would let the app offer a request
-- the server then refuses.
--
-- Admin views of request media are audit-logged as job_media_viewed. That
-- name is appended to admin_actions_action_type_check with the two-anchor
-- splice from migration 171, which accepts both stored forms of that
-- constraint and adds nothing when the name is already present.
-- No BEGIN/COMMIT: run-reviewed-migrations.mjs applies it in one transaction.

CREATE TABLE IF NOT EXISTS job_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  purpose TEXT NOT NULL DEFAULT 'job_request' CHECK (purpose IN ('job_request','chat')),
  booking_id UUID REFERENCES bookings(id),
  conversation_id UUID REFERENCES conversations(id),
  kind TEXT NOT NULL CHECK (kind IN ('photo','video','voice')),
  client_upload_id UUID NOT NULL,
  declared_mime TEXT NOT NULL CHECK (declared_mime ~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'),
  declared_bytes BIGINT NOT NULL CHECK (declared_bytes > 0),
  declared_duration_ms INTEGER CHECK (declared_duration_ms BETWEEN 0 AND 600000),
  limit_bytes BIGINT NOT NULL CHECK (limit_bytes > 0),
  limit_duration_ms INTEGER CHECK (limit_duration_ms > 0),
  chunk_bytes INTEGER NOT NULL CHECK (chunk_bytes BETWEEN 262144 AND 8388608),
  bytes_received BIGINT NOT NULL DEFAULT 0,
  mime TEXT CHECK (mime IN ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime',
                            'video/3gpp','audio/mp4','audio/3gpp','audio/webm','audio/ogg')),
  size_bytes BIGINT CHECK (size_bytes > 0),
  duration_ms INTEGER CHECK (duration_ms >= 0),
  duration_source TEXT CHECK (duration_source IN ('container','client')),
  width INTEGER CHECK (width BETWEEN 1 AND 20000),
  height INTEGER CHECK (height BETWEEN 1 AND 20000),
  codec TEXT CHECK (codec ~ '^[A-Za-z0-9 ._-]{1,16}$'),
  storage_key TEXT UNIQUE CHECK (storage_key ~
    '^private-artifacts/job-media/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|mp4|mov|3gp|m4a|webm|ogg)$'),
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading','processing','stored','attached','rejected','deleted')),
  rejection_code TEXT CHECK (rejection_code ~ '^[a-z_]{1,40}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stored_at TIMESTAMPTZ, attached_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ, purged_at TIMESTAMPTZ,
  CONSTRAINT uq_job_media_owner_client_upload UNIQUE (owner_user_id, client_upload_id),
  CHECK (bytes_received BETWEEN 0 AND declared_bytes),
  CHECK (declared_bytes <= limit_bytes),
  CHECK (kind = 'photo' OR (declared_duration_ms IS NOT NULL AND limit_duration_ms IS NOT NULL)),
  CHECK ((purpose = 'chat') = (conversation_id IS NOT NULL)),
  CHECK (purpose <> 'chat' OR kind IN ('photo','voice')),
  CHECK (status NOT IN ('stored','attached')
         OR (storage_key IS NOT NULL AND mime IS NOT NULL AND size_bytes IS NOT NULL AND stored_at IS NOT NULL)),
  CHECK (status <> 'attached' OR (booking_id IS NOT NULL AND attached_at IS NOT NULL)),
  CHECK (booking_id IS NULL OR attached_at IS NOT NULL),
  CHECK (status <> 'rejected' OR rejection_code IS NOT NULL),
  CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_job_media_booking ON job_media (booking_id, kind, created_at) WHERE status = 'attached';
CREATE INDEX IF NOT EXISTS idx_job_media_owner_open ON job_media (owner_user_id, created_at)
  WHERE status IN ('uploading','processing','stored');
CREATE INDEX IF NOT EXISTS idx_job_media_cleanup ON job_media (updated_at) WHERE status IN ('uploading','processing','stored');
CREATE INDEX IF NOT EXISTS idx_job_media_purge ON job_media (deleted_at) WHERE status = 'deleted' AND purged_at IS NULL;

INSERT INTO platform_settings (category, subcategory, key, label, description, value_type,
  value, default_value, min_value, max_value, unit, display_order, is_active) VALUES
 ('security','uploads','job_media_max_photos','Request photos per job','Most photos a customer can attach to one job request. At most 6, so the photos plus one video and one voice note fit the 8 items a request accepts.','integer','6','6',0,6,'photos',430,TRUE),
 ('security','uploads','job_media_photo_max_bytes','Request and chat photo size limit','Largest photo accepted for a job request or a request thread.','integer','10485760','10485760',1048576,15728640,'bytes',431,TRUE),
 ('security','uploads','job_media_video_max_seconds','Request video length limit','Longest request video; the server measures the file itself.','integer','30','30',5,60,'seconds',432,TRUE),
 ('security','uploads','job_media_video_max_bytes','Request video size limit','Largest request video file.','integer','83886080','83886080',10485760,157286400,'bytes',433,TRUE),
 ('security','uploads','job_media_voice_max_seconds','Voice note length limit','Longest voice note on a job request or in a request thread.','integer','60','60',10,120,'seconds',434,TRUE),
 ('security','uploads','job_media_voice_max_bytes','Voice note size limit','Largest voice-note file.','integer','2097152','2097152',262144,10485760,'bytes',435,TRUE)
ON CONFLICT (key) DO NOTHING;

DO $migration_184_action$
DECLARE current_def TEXT; appendage TEXT; missing_verbs TEXT[] := ARRAY['job_media_viewed'];
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
END $migration_184_action$;

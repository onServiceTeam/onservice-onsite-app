-- Migration 185: one message thread per (booking, provider) (D38). Additive.
--
-- Ken's human-audit notes: the customer and the provider who responds talk in
-- a message thread. D38: a thread opens when a provider sends a quote, goes
-- read-only when that quote is declined or another provider is booked, and the
-- booked job keeps the same thread. Plan: qa-frameworks/human-audit-2026-10-13/
-- merged.md section 1 (this SQL), with the critique.md corrections.
--
--   conversations  booking_id is no longer unique on its own: each provider who
--                  quotes gets a thread, so the rule becomes (booking_id,
--                  provider_id). Existing rows already satisfy the wider rule
--                  because booking_id was unique (123). The new rule is added
--                  first, then the old one is dropped.
--                  state / state_reason store only an admin reassignment
--                  (provider_reassigned). Every other read-only reason
--                  (declined, expired or withdrawn quote, another provider
--                  booked, request cancelled) is derived from the quote and the
--                  booking at read time (request-thread.service.ts
--                  THREAD_STATE_SQL), so no money path writes thread state.
--   messages       voice (and, at the database level, video) messages that
--                  point at a private job_media row (184), system events,
--                  the sender's idempotency key for retried sends, and a
--                  separate per-thread key for system messages.
--   platform_settings  request_threads_enabled, the off-valve for pre-booking
--                  threads while chat contact masking is not built.
--
-- Data safety: every new column is nullable or has a constant default, so no
-- table is rewritten and every existing conversation reads as 'open'. Every new
-- CHECK already holds for every existing row. The only removal is
-- conversations_booking_id_unique, replaced by the wider
-- conversations_booking_provider_unique in the same transaction. The settings
-- row uses ON CONFLICT DO NOTHING, so an operator's value is never overwritten.
--
-- Deploy: the old API image writes ON CONFLICT (booking_id), which fails once
-- conversations_booking_id_unique is gone, so this migration and the new image
-- go live in one release step (merged.md bad news 6, critique M10). Rollback
-- may re-add conversations_booking_id_unique only while no booking has two
-- threads.
--
-- Two changes to the merged.md SQL:
--   1. 'quote_withdrawn' is an allowed system_event. The critique (M13) adds
--      the provider withdraw path and the quote_withdrawn read-only reason,
--      and the threads plan posts a quote_withdrawn system message; without it
--      here that message could never be stored.
--   2. uq_messages_sender_client_message leaves out system messages, and
--      uq_messages_system_key gives system messages their own per-thread key
--      (see the index comment below).
--
-- Must run after 184: messages.media_id references job_media.
-- No BEGIN/COMMIT: run-reviewed-migrations.mjs applies it in one transaction.

DO $migration_185_unique$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_booking_provider_unique'
                  AND conrelid = 'conversations'::regclass) THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_booking_provider_unique UNIQUE (booking_id, provider_id);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_booking_id_unique'
              AND conrelid = 'conversations'::regclass) THEN
    ALTER TABLE conversations DROP CONSTRAINT conversations_booking_id_unique;
  END IF;
END $migration_185_unique$;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS state VARCHAR(20) NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS state_reason VARCHAR(40),
  ADD COLUMN IF NOT EXISTS state_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_by_quote_id UUID REFERENCES booking_quotes(id) ON DELETE SET NULL;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_state_check CHECK (state IN ('open','read_only')),
  ADD CONSTRAINT conversations_state_reason_check CHECK (state_reason IS NULL OR state_reason IN ('provider_reassigned')),
  ADD CONSTRAINT conversations_state_reason_pairing CHECK ((state = 'read_only') = (state_reason IS NOT NULL));

-- The 006 message_type CHECK was declared inline, so its name is generated.
DO $migration_185_type$ DECLARE c_name TEXT; BEGIN
  FOR c_name IN SELECT conname FROM pg_constraint
                 WHERE conrelid = 'messages'::regclass AND contype = 'c'
                   AND pg_get_constraintdef(oid) LIKE '%message_type%' LOOP
    EXECUTE format('ALTER TABLE messages DROP CONSTRAINT %I', c_name);
  END LOOP;
END $migration_185_type$;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('text','image','system','location','voice','video'));

-- content stays NOT NULL ('' for a media message without a caption).
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_id UUID REFERENCES job_media(id),
  ADD COLUMN IF NOT EXISTS media_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS system_event VARCHAR(40),
  ADD COLUMN IF NOT EXISTS client_message_id UUID;
ALTER TABLE messages
  ADD CONSTRAINT messages_media_duration_check CHECK (media_duration_ms IS NULL OR media_duration_ms BETWEEN 1 AND 600000),
  ADD CONSTRAINT messages_voice_has_media CHECK (message_type NOT IN ('voice','video') OR media_id IS NOT NULL),
  ADD CONSTRAINT messages_system_event_check CHECK (system_event IS NULL OR (message_type = 'system' AND system_event IN (
    'quote_sent','quote_declined','quote_withdrawn','quote_expired','booking_confirmed',
    'provider_reassigned_out','provider_reassigned_in')));
-- Retry keys. A participant's clientMessageId is unique per sender; a system
-- message's key (request-thread.service systemMessageKey, worked out from ids
-- participants can see) is unique per thread. They never share a unique rule,
-- so a participant cannot use up a system message's key, and a participant who
-- reuses one never gets the system message back as their own. (merged.md has
-- the first index without the message_type condition and no second index;
-- changed by the P4 review fix before 185 shipped.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_sender_client_message ON messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL AND message_type <> 'system';
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_system_key ON messages (conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL AND message_type = 'system';
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_media ON messages (media_id) WHERE media_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages (conversation_id, sender_id) WHERE is_read = FALSE;

-- SETTING_DEFAULTS in settings.service.ts carries the same key and default.
INSERT INTO platform_settings (category, subcategory, key, label, description, value_type,
  value, default_value, min_value, max_value, unit, display_order, is_active) VALUES
 ('provider','requests','request_threads_enabled','Request message threads',
  'When on, the customer and each provider who sends a quote can message each other before booking (D38). When off, new threads open only for the booked provider; existing threads are unchanged.',
  'boolean','true','true',NULL,NULL,NULL,27,TRUE)
ON CONFLICT (key) DO NOTHING;

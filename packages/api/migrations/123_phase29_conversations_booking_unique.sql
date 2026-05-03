-- Migration 123 — Phase 29d fix.
--
-- BUG-PHASE29-02: messaging.service.getOrCreateConversation uses
-- `INSERT INTO conversations ... ON CONFLICT (booking_id) DO UPDATE`.
-- Postgres parses the ON CONFLICT clause and rejects with
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" if booking_id has no UNIQUE constraint. The conversations
-- table only had a non-unique btree index (`idx_conversations_booking`),
-- so every POST /api/v1/messaging that hit the INSERT branch 500'd.
-- The only customer/provider chat would have worked is when the
-- conversation already existed (the SELECT pre-check at line 64-69 of
-- messaging.service.ts). First-time chat creation: 100% broken.
--
-- Fix: add a UNIQUE index on conversations.booking_id. This:
--   1. Satisfies the ON CONFLICT specification → INSERT works.
--   2. Enforces the business invariant (one conversation per booking).
--   3. Replaces the existing non-unique idx_conversations_booking with
--      the unique version (drop + create as unique).
--
-- Defensive: if any duplicate (booking_id) rows exist they're collapsed
-- to the oldest row first; the messages table has FK on conversation_id
-- so messages on the duplicates need to be re-pointed.

DO $migration_123$
DECLARE
  dup_count INT;
BEGIN
  -- Step 1: collapse duplicates if any (defense — should be 0 in dev).
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT booking_id, COUNT(*) AS c
    FROM conversations
    GROUP BY booking_id
    HAVING COUNT(*) > 1
  ) t;

  IF dup_count > 0 THEN
    RAISE NOTICE 'Migration 123: collapsing % duplicate conversation rows...', dup_count;
    -- Re-point messages from younger duplicates to the oldest survivor.
    WITH ranked AS (
      SELECT id, booking_id,
             ROW_NUMBER() OVER (PARTITION BY booking_id ORDER BY created_at ASC, id ASC) AS rn
        FROM conversations
    )
    UPDATE messages m
       SET conversation_id = (
         SELECT id FROM ranked WHERE rn = 1
            AND ranked.booking_id = (SELECT booking_id FROM conversations WHERE id = m.conversation_id)
       )
     WHERE conversation_id IN (SELECT id FROM ranked WHERE rn > 1);
    -- Drop the younger duplicates.
    DELETE FROM conversations WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY booking_id ORDER BY created_at ASC, id ASC) AS rn
          FROM conversations
      ) t WHERE rn > 1
    );
  END IF;

  -- Step 2: drop the non-unique index, replace with unique constraint.
  IF EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE tablename = 'conversations' AND indexname = 'idx_conversations_booking'
  ) THEN
    DROP INDEX IF EXISTS idx_conversations_booking;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'conversations_booking_id_unique'
       AND conrelid = 'conversations'::regclass
  ) THEN
    ALTER TABLE conversations
      ADD CONSTRAINT conversations_booking_id_unique UNIQUE (booking_id);
    RAISE NOTICE 'Migration 123: UNIQUE constraint added on conversations.booking_id.';
  ELSE
    RAISE NOTICE 'Migration 123: UNIQUE constraint already present; skipped.';
  END IF;
END
$migration_123$;

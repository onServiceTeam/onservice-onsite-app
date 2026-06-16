-- Migration: 135 — feedback_submissions
--
-- Stores UX tester feedback submitted from the public /feedback page.
-- One row per submission. The full questionnaire payload is kept in JSONB so
-- the form can evolve without a schema change; a few fields are extracted into
-- typed columns so humans and the AI coder can sort/scan without parsing JSON.
--
-- No personal data is required (name/contact are optional free-text). Rows are
-- review material for the dev + design team, not platform records.

CREATE TABLE IF NOT EXISTS feedback_submissions (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tester_name    TEXT,
    tester_contact TEXT,
    role           TEXT,                       -- customer | provider | admin | mixed
    device         TEXT,
    areas          TEXT[],                     -- areas the tester actually tried
    nps            SMALLINT,                   -- 0..10 "would recommend", nullable
    summary        TEXT,                       -- one-line gist for quick scanning
    item_count     INTEGER NOT NULL DEFAULT 0, -- number of bug/idea log items
    payload        JSONB NOT NULL,             -- full questionnaire + items
    status         TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'triaged', 'done')),
    user_agent     TEXT,
    ip             TEXT
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_status  ON feedback_submissions (status);
CREATE INDEX IF NOT EXISTS idx_feedback_nps     ON feedback_submissions (nps);

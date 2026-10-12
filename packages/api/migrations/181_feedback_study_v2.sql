-- Migration 181: tester feedback version 2 (Ken, 2026-10-12).
--
-- The /feedback page becomes a mission-based usability study: a tester starts
-- a session, then saves a first impression, one entry per mission, any number
-- of problem reports and one wrap-up, each as soon as it is finished, so
-- nothing is lost when a phone drops the tab. Additive only: the version 1
-- table feedback_submissions and its rows are untouched and stay readable.
--
-- No sign-in is needed. A session is resumed with a random token that only the
-- tester's browser holds; the database keeps a SHA-256 digest of it.

CREATE TABLE feedback_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- The study wording the tester saw (question text lives in the API's
  -- versioned study definition, so answers can always be tied to it).
  study_version TEXT NOT NULL CHECK (length(study_version) BETWEEN 1 AND 20),
  token_hash TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  role TEXT NOT NULL CHECK (role IN ('customer', 'provider', 'both')),
  device_kind TEXT CHECK (device_kind IN ('phone', 'tablet', 'computer')),
  app_surface TEXT CHECK (app_surface IN ('apk', 'browser', 'both')),
  platform_detail TEXT CHECK (length(platform_detail) <= 200),
  app_version TEXT CHECK (length(app_version) <= 40),
  help_methods TEXT[] NOT NULL DEFAULT '{}',
  tester_name TEXT CHECK (length(tester_name) <= 200),
  tester_contact TEXT CHECK (length(tester_contact) <= 200),
  consent_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dismissed')),
  ip INET,
  user_agent TEXT CHECK (length(user_agent) <= 500)
);
CREATE INDEX idx_feedback_sessions_created ON feedback_sessions (created_at DESC);

CREATE TABLE feedback_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES feedback_sessions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('first_impression', 'mission', 'problem', 'wrapup')),
  -- Mission key from the study definition; 'first_impression', 'wrapup' or
  -- 'problem' for the other kinds.
  item_key TEXT NOT NULL CHECK (item_key ~ '^[a-z0-9_]{1,40}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mission_outcome TEXT CHECK (mission_outcome IN ('done', 'partly', 'no', 'gave_up')),
  -- Single Ease Question, 1 = very difficult, 7 = very easy.
  seq SMALLINT CHECK (seq BETWEEN 1 AND 7),
  severity TEXT CHECK (severity IN ('stopped', 'slowed', 'annoyed', 'looks_wrong')),
  screen_key TEXT CHECK (screen_key ~ '^[a-z0-9_]{1,60}$'),
  -- Filled in by the app when the report starts inside it.
  screen_route TEXT CHECK (length(screen_route) <= 200),
  -- App version the report came from (an installed APK can update mid-study).
  app_version TEXT CHECK (length(app_version) <= 40),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(answers) = 'object'),
  -- System Usability Scale: ten answers 1-5, and the 0-100 score.
  sus SMALLINT[] CHECK (sus IS NULL OR (cardinality(sus) = 10 AND 1 <= ALL (sus) AND 5 >= ALL (sus))),
  sus_score NUMERIC(5, 2) CHECK (sus_score BETWEEN 0 AND 100),
  prices JSONB CHECK (prices IS NULL OR jsonb_typeof(prices) = 'object'),
  screenshots TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(screenshots) <= 10),
  -- Triage, used for problem reports.
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'triaged', 'planned', 'done', 'dismissed', 'duplicate')),
  duplicate_of UUID REFERENCES feedback_entries(id) ON DELETE SET NULL,
  assigned_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  triage_note TEXT CHECK (length(triage_note) <= 2000),
  CHECK ((kind = 'problem') = (item_key = 'problem')),
  CHECK (kind <> 'problem' OR severity IS NOT NULL),
  CHECK (kind = 'mission' OR (mission_outcome IS NULL AND seq IS NULL)),
  CHECK (kind = 'wrapup' OR (sus IS NULL AND sus_score IS NULL AND prices IS NULL)),
  CHECK ((status = 'duplicate') = (duplicate_of IS NOT NULL)),
  CHECK (duplicate_of IS NULL OR duplicate_of <> id)
);
-- One first impression, one entry per mission and one wrap-up per session;
-- saving again replaces it. Problem reports are unlimited (capped in code).
CREATE UNIQUE INDEX uq_feedback_entries_one_per_item
  ON feedback_entries (session_id, kind, item_key) WHERE kind <> 'problem';
CREATE INDEX idx_feedback_entries_session ON feedback_entries (session_id, created_at);
CREATE INDEX idx_feedback_entries_problems
  ON feedback_entries (status, screen_key, created_at DESC) WHERE kind = 'problem';

-- Every uploaded screenshot, so files a tester never attached can be deleted
-- and each file can be read only through the entry that references it.
CREATE TABLE feedback_uploads (
  filename TEXT PRIMARY KEY CHECK (filename ~ '^[0-9a-f-]{36}\.(jpg|png|webp)$'),
  session_id UUID NOT NULL REFERENCES feedback_sessions(id) ON DELETE CASCADE,
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attached_at TIMESTAMPTZ
);
CREATE INDEX idx_feedback_uploads_unattached ON feedback_uploads (created_at) WHERE attached_at IS NULL;
CREATE INDEX idx_feedback_uploads_session ON feedback_uploads (session_id);

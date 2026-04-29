-- Migration 071: Cancellation policies (server-canonical, admin-editable).
-- Phase 14 Dispatch 02 — Bug 1170 / 1198 fix.
--
-- Replaces the four drifted hardcoded sources of cancellation policy
-- (platform.config.ts, mobile terms.tsx, mobile help.tsx, migration 050 +
-- tests) with a single versioned table the admin UI can edit.
--
-- Versioning model:
--   - Each row is one immutable version of the policy.
--   - At most one version is "active" at any moment: effective_from <= NOW()
--     AND (effective_to IS NULL OR effective_to > NOW()).
--   - Saving a new version sets the prior active version's effective_to to
--     NOW() and inserts a new row with version = max(version) + 1 and
--     effective_from = NOW().
--   - In-place edit of the current version is allowed only within 1 hour
--     of created_at (typo-correction window). After that, "save as new
--     version" is the only path forward, preserving auditability.
--
-- Tier shape (JSONB array, validated server-side and client-side):
--   { min_hours_before: number,
--     max_hours_before: number | null,
--     refund_percent:   0..100,
--     fee_percent:      0..100,
--     label:            string }
--
-- Tier rules (enforced by Zod schemas in cancellation-policy.validators.ts,
-- not by SQL — SQL just confirms the array structural type):
--   - At least one row.
--   - Hours intervals are contiguous and non-overlapping.
--   - refund_percent + fee_percent === 100 per row.
--   - min_hours_before strictly descending across rows (top-of-table is the
--     "most lead time" tier; bottom is post-scheduled / no-show).
--
-- The provider-no-show counterbalance is NOT a tier — it's a single integer
-- column on this table (provider_no_show_credit_php) so admin can tune the
-- platform-funded apology credit without schema changes.

CREATE TABLE cancellation_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL,
  effective_from TIMESTAMPTZ NOT NULL,
  effective_to TIMESTAMPTZ,
  tiers JSONB NOT NULL,
  intro_text TEXT NOT NULL,
  legal_disclaimer TEXT NOT NULL,
  provider_no_show_credit_php INTEGER NOT NULL DEFAULT 200,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(tiers) = 'array'),
  CHECK (provider_no_show_credit_php >= 0)
);

CREATE UNIQUE INDEX idx_cancellation_policies_version
  ON cancellation_policies(version);

CREATE INDEX idx_cancellation_policies_effective
  ON cancellation_policies(effective_from, effective_to);

COMMENT ON TABLE cancellation_policies IS
  'Versioned cancellation policy. Bug 1170/1198 fix (Phase 14 Dispatch 02). Server canonical, admin editable. The active row is the most recent where effective_from <= NOW() AND (effective_to IS NULL OR effective_to > NOW()).';
COMMENT ON COLUMN cancellation_policies.tiers IS
  'JSONB array of { min_hours_before, max_hours_before, refund_percent, fee_percent, label }. Validated by Zod, not SQL.';
COMMENT ON COLUMN cancellation_policies.provider_no_show_credit_php IS
  'Platform-funded apology credit (in pesos) for provider-no-show events. Separate from tier table because it is not a customer-cancellation tier.';

-- Seed version 1 (launch defaults — see .ai-coder/decisions/D02-cancellation-policy.md).
INSERT INTO cancellation_policies (
  version, effective_from, tiers,
  intro_text, legal_disclaimer, provider_no_show_credit_php
) VALUES (
  1,
  NOW(),
  '[
    { "min_hours_before": 24,    "max_hours_before": null, "refund_percent": 100, "fee_percent": 0,   "label": "24+ hours before" },
    { "min_hours_before": 4,     "max_hours_before": 24,   "refund_percent": 75,  "fee_percent": 25,  "label": "4-24 hours before" },
    { "min_hours_before": 0,     "max_hours_before": 4,    "refund_percent": 50,  "fee_percent": 50,  "label": "under 4 hours" },
    { "min_hours_before": -999,  "max_hours_before": 0,    "refund_percent": 0,   "fee_percent": 100, "label": "after scheduled time / no-show" }
  ]'::jsonb,
  'Cancel anytime. Refunds depend on how close to your booking you cancel.',
  'Refund processed to original payment method within 5-10 business days. Service fees and taxes are non-refundable except for the 100%-refund tier.',
  200
);

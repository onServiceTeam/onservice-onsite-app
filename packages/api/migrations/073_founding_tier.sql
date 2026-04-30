-- Migration 073: Add 'founding' to the providers.tier CHECK constraint.
-- Phase 14 Dispatch 02 Part 3 — Bug 1323 fix.
--
-- Per docs/STRATEGIC-DECISIONS-LOG.md DECISION-003 the platform commits to a
-- founding-batch tier with 10% commission (vs. 15% / 13% / 11% / 9% for the
-- standard tiers). The commission rate has lived in `platform_settings` as
-- `commission_rate_founding` since migration 050, and `getCommissionRate`
-- already routes through there. The schema, however, never accepted
-- 'founding' as a value of providers.tier — so admin couldn't actually set
-- a provider to founding without violating the CHECK constraint. This
-- migration closes that gap.

ALTER TABLE providers DROP CONSTRAINT IF EXISTS providers_tier_check;
ALTER TABLE providers ADD CONSTRAINT providers_tier_check
  CHECK (tier IN ('founding', 'new', 'verified', 'pro', 'elite'));

COMMENT ON COLUMN providers.tier IS
  'Provider tier — founding | new | verified | pro | elite. Commission rates are admin-editable in platform_settings under category=commissions (commission_rate_founding etc.). Bug 1323 fix (Phase 14 Dispatch 02 Part 3) added founding to this enum; the rate row already existed.';

-- D27 Phase 4b — hourly pricing via capped pre-authorization.
--
-- Lifts LAUNCH-LIMITATIONS §24 (hourly was deferred) and supersedes the
-- deferral in .ai-coder/decisions/D27p4-hourly-pricing.md (Ken delegated the
-- choice 2026-06-29; chosen model = capped pre-auth).
--
-- Model: at booking the customer authorizes estimated_hours x hourly_rate
-- (server-clamped to max_estimated_hours, rounded up to the billing increment).
-- That CAPPED amount is held in escrow exactly like a fixed-price booking. The
-- provider's start (in_progress) and complete (completed_by_provider)
-- transitions stamp work_started_at / work_completed_at from the SERVER clock
-- (never a client-sent value). On confirmation the server bills
-- min(actual, estimated) hours, rewrites service_price DOWN, refunds the unused
-- remainder to the customer, then runs the existing escrow release so the
-- provider + platform are paid on ACTUAL hours.
--
-- pricing_type already permits 'hourly' (migration 142's CHECK), so no CHECK
-- change is needed here. Additive only.

-- Per-subcategory hourly config (centavos per hour + rounding rules).
ALTER TABLE service_subcategories ADD COLUMN IF NOT EXISTS hourly_rate INTEGER;
ALTER TABLE service_subcategories ADD COLUMN IF NOT EXISTS min_billable_minutes INTEGER NOT NULL DEFAULT 60;
ALTER TABLE service_subcategories ADD COLUMN IF NOT EXISTS billing_increment_minutes INTEGER NOT NULL DEFAULT 30;
ALTER TABLE service_subcategories ADD COLUMN IF NOT EXISTS max_estimated_hours NUMERIC(5,2) NOT NULL DEFAULT 8;

-- Per-booking hourly state. hourly_rate is a snapshot of the subcategory rate at
-- booking time (server-canonical). estimated_hours is the rounded, actually-
-- authorized hours (the cap). billed_hours is filled at settlement.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_hourly BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(5,2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS hourly_rate INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS work_started_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS work_completed_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS billed_hours NUMERIC(5,2);

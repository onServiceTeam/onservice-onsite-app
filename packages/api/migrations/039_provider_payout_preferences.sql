-- Provider payout schedule preferences.
-- Providers can set auto-payout cadence and minimum threshold.

ALTER TABLE providers
  ADD COLUMN IF NOT EXISTS payout_frequency VARCHAR(20) DEFAULT 'manual'
    CHECK (payout_frequency IN ('manual', 'daily', 'weekly', 'biweekly', 'monthly')),
  ADD COLUMN IF NOT EXISTS payout_min_threshold INTEGER DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS payout_preferred_method VARCHAR(20) DEFAULT 'gcash',
  ADD COLUMN IF NOT EXISTS payout_destination_account VARCHAR(100);

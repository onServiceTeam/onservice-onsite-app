-- Migration 049: Add provider cancellation tracking columns
-- Tracks cancellation count and rate for provider accountability (PROV-007)

ALTER TABLE providers
  ADD COLUMN cancellations_last_30d INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN total_cancellations INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN last_cancellation_at TIMESTAMPTZ;

-- Index for admin queries on high-cancellation providers
CREATE INDEX idx_providers_cancellations ON providers(cancellations_last_30d DESC)
  WHERE cancellations_last_30d > 0;

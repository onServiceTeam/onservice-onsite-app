-- Migration: Sprint 10 Performance Optimization Indexes
-- Targets hot paths identified in query analysis: scheduler jobs, booking flows, dispute checks

-- HIGH IMPACT: Scheduler job - expireStaleQuotes (runs every 5 min via 'all')
CREATE INDEX IF NOT EXISTS idx_booking_quotes_submitted_created
  ON booking_quotes (created_at)
  WHERE status = 'submitted';

-- HIGH IMPACT: Scheduler job - autoConfirmBookings (runs every 5 min via 'all')
CREATE INDEX IF NOT EXISTS idx_bookings_completed_provider_completed_at
  ON bookings (completed_at)
  WHERE status = 'completed_by_provider';

-- HIGH IMPACT: Scheduler job - detectNoShows anti-join on notifications JSONB
CREATE INDEX IF NOT EXISTS idx_notifications_noshow_alert
  ON notifications (user_id, ((data->>'bookingId')))
  WHERE (data->>'noShowAlert') = 'true';

-- HIGH IMPACT: Booking flow - provider status lookup (many booking flows)
CREATE INDEX IF NOT EXISTS idx_providers_user_id_status
  ON providers (user_id, status);

-- MEDIUM IMPACT: Dispute open-count per booking
CREATE INDEX IF NOT EXISTS idx_disputes_booking_status
  ON disputes (booking_id, status);

-- MEDIUM IMPACT: Auto-escalate stale disputes (every 6 hours)
CREATE INDEX IF NOT EXISTS idx_disputes_open_pending_response
  ON disputes (created_at)
  WHERE status = 'open' AND provider_response IS NULL;

-- MEDIUM IMPACT: Bypass detection weekly scan
CREATE INDEX IF NOT EXISTS idx_messages_bypass_scan
  ON messages (created_at)
  WHERE is_flagged = FALSE AND message_type = 'text';

-- MEDIUM IMPACT: Admin analytics - latest quality score per provider
CREATE INDEX IF NOT EXISTS idx_provider_quality_scores_latest
  ON provider_quality_scores (provider_id, computed_at DESC);

-- MEDIUM IMPACT: Admin analytics - revenue by provider
CREATE INDEX IF NOT EXISTS idx_bookings_provider_confirmed_revenue
  ON bookings (provider_id, confirmed_at DESC)
  WHERE status IN ('confirmed', 'payout_ready', 'paid_out');

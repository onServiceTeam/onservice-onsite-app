-- Sprint 10: Performance optimization — essential indexes per SDLC spec Section 3
-- These are compound and partial indexes that supplement existing single-column indexes

-- Users: partial index for email lookups (most users sign up with phone only)
CREATE INDEX IF NOT EXISTS idx_users_email_partial ON users(email) WHERE email IS NOT NULL;

-- Users: compound index for role-based queries (admin panel listing)
CREATE INDEX IF NOT EXISTS idx_users_role_created ON users(role, created_at DESC);

-- Bookings: compound indexes for customer/provider history (most common queries)
CREATE INDEX IF NOT EXISTS idx_bookings_customer_date ON bookings(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_date ON bookings(provider_id, created_at DESC);

-- Bookings: partial index for active bookings only (dashboard, matching queries)
CREATE INDEX IF NOT EXISTS idx_bookings_status_active
  ON bookings(status)
  WHERE status NOT IN ('confirmed', 'paid_out', 'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin', 'resolved');

-- Bookings: partial index for scheduled bookings awaiting provider (tracking queries)
CREATE INDEX IF NOT EXISTS idx_bookings_scheduled_active
  ON bookings(scheduled_at)
  WHERE status IN ('paid', 'matched', 'provider_en_route');

-- Provider services: compound index for matching algorithm (find providers for a subcategory)
CREATE INDEX IF NOT EXISTS idx_provider_services_subcategory
  ON provider_services(subcategory_id, provider_id);

-- Wallet transactions: compound index for transaction history queries
CREATE INDEX IF NOT EXISTS idx_wallet_txn_wallet_date
  ON wallet_transactions(wallet_id, created_at DESC);

-- Wallet transactions: index for platform revenue reports (admin financials)
CREATE INDEX IF NOT EXISTS idx_wallet_txn_type_created
  ON wallet_transactions(type, created_at DESC)
  WHERE type IN ('commission', 'service_fee', 'refund');

-- Reviews: compound index for provider rating display
CREATE INDEX IF NOT EXISTS idx_reviews_provider_date
  ON reviews(provider_id, created_at DESC);

-- Notifications: compound index for user notification feed
CREATE INDEX IF NOT EXISTS idx_notifications_user_date
  ON notifications(user_id, created_at DESC);

-- Suki memberships: compound for customer loyalty dashboard
CREATE INDEX IF NOT EXISTS idx_suki_customer_booking
  ON suki_memberships(customer_id, last_booking_at DESC NULLS LAST);

-- Payouts: compound for admin payout management
CREATE INDEX IF NOT EXISTS idx_payouts_status_created
  ON payouts(status, created_at DESC);

-- Referral redemptions: for referral history queries
CREATE INDEX IF NOT EXISTS idx_referral_redemptions_referee
  ON referral_redemptions(referee_id);

-- Disputes: partial index for admin dashboard alerts (open/escalated only)
CREATE INDEX IF NOT EXISTS idx_disputes_active
  ON disputes(status, created_at)
  WHERE status IN ('open', 'under_review', 'escalated');

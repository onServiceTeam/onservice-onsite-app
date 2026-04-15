-- Migration: Sprint 5 — Payouts workflow, Tips, Referrals, Suki Loyalty, Notification Templates

-- 1. Enhance payouts with admin approval workflow
ALTER TABLE payouts DROP CONSTRAINT IF EXISTS payouts_status_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_status_check
    CHECK (status IN ('pending', 'processing', 'approved', 'completed', 'rejected', 'failed'));
ALTER TABLE payouts ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE payouts
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS account_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. Tips table
CREATE TABLE tips (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id),
    customer_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID NOT NULL REFERENCES providers(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    payment_method VARCHAR(30) NOT NULL DEFAULT 'wallet'
        CHECK (payment_method IN ('wallet', 'gcash', 'maya', 'card')),
    status VARCHAR(20) NOT NULL DEFAULT 'completed'
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tips_booking ON tips(booking_id);
CREATE INDEX idx_tips_customer ON tips(customer_id);
CREATE INDEX idx_tips_provider ON tips(provider_id);
CREATE UNIQUE INDEX idx_tips_booking_customer ON tips(booking_id, customer_id);

-- 3. Referral codes
CREATE TABLE referral_codes (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID NOT NULL REFERENCES users(id),
    code VARCHAR(20) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL DEFAULT 'standard'
        CHECK (type IN ('standard', 'promo', 'influencer')),
    uses_count INTEGER NOT NULL DEFAULT 0,
    max_uses INTEGER,
    referrer_bonus BIGINT NOT NULL DEFAULT 5000,
    referee_bonus BIGINT NOT NULL DEFAULT 5000,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_referral_codes_user ON referral_codes(user_id);
CREATE INDEX idx_referral_codes_code ON referral_codes(code);
CREATE INDEX idx_referral_codes_active ON referral_codes(is_active) WHERE is_active = TRUE;

-- 4. Referral redemptions
CREATE TABLE referral_redemptions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    referral_code_id UUID NOT NULL REFERENCES referral_codes(id),
    referrer_id UUID NOT NULL REFERENCES users(id),
    referee_id UUID NOT NULL REFERENCES users(id),
    referrer_bonus BIGINT NOT NULL,
    referee_bonus BIGINT NOT NULL,
    referrer_credited BOOLEAN NOT NULL DEFAULT FALSE,
    referee_credited BOOLEAN NOT NULL DEFAULT FALSE,
    qualifying_booking_id UUID REFERENCES bookings(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_referral_redemptions_referee ON referral_redemptions(referee_id);
CREATE INDEX idx_referral_redemptions_referrer ON referral_redemptions(referrer_id);

-- 5. Suki (loyalty) memberships
CREATE TABLE suki_memberships (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID NOT NULL REFERENCES providers(id),
    total_bookings INTEGER NOT NULL DEFAULT 0,
    total_spent BIGINT NOT NULL DEFAULT 0,
    tier VARCHAR(20) NOT NULL DEFAULT 'new'
        CHECK (tier IN ('new', 'regular', 'suki', 'super_suki')),
    points_balance INTEGER NOT NULL DEFAULT 0,
    last_booking_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, provider_id)
);

CREATE INDEX idx_suki_customer ON suki_memberships(customer_id);
CREATE INDEX idx_suki_provider ON suki_memberships(provider_id);
CREATE INDEX idx_suki_tier ON suki_memberships(tier);

-- 6. Suki reward transactions (points earned/redeemed)
CREATE TABLE suki_rewards (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    membership_id UUID NOT NULL REFERENCES suki_memberships(id),
    booking_id UUID REFERENCES bookings(id),
    type VARCHAR(20) NOT NULL CHECK (type IN ('earned', 'redeemed', 'expired', 'bonus')),
    points INTEGER NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suki_rewards_membership ON suki_rewards(membership_id);

-- 7. Notification templates (admin-managed)
CREATE TABLE notification_templates (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    title_template TEXT NOT NULL,
    body_template TEXT NOT NULL,
    type VARCHAR(30) NOT NULL
        CHECK (type IN (
            'booking_update', 'payment', 'dispute_update', 'tier_upgrade',
            'payout', 'referral', 'suki', 'promo', 'system'
        )),
    channel VARCHAR(20) NOT NULL DEFAULT 'in_app'
        CHECK (channel IN ('in_app', 'push', 'sms', 'email', 'all')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    variables JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_templates_slug ON notification_templates(slug);
CREATE INDEX idx_notification_templates_type ON notification_templates(type);

-- Seed default notification templates
INSERT INTO notification_templates (slug, title_template, body_template, type, channel, variables) VALUES
    ('booking_created', 'Booking Created', 'Your booking #{{bookingId}} has been created. We will find the best provider for you.', 'booking_update', 'all', '["bookingId"]'::jsonb),
    ('booking_matched', 'Provider Matched', '{{providerName}} has been matched to your booking #{{bookingId}}.', 'booking_update', 'all', '["providerName", "bookingId"]'::jsonb),
    ('booking_completed', 'Job Completed', 'Your booking #{{bookingId}} has been marked as complete. Please confirm within 24 hours.', 'booking_update', 'all', '["bookingId"]'::jsonb),
    ('payment_received', 'Payment Received', 'Payment of {{amount}} for booking #{{bookingId}} has been received.', 'payment', 'all', '["amount", "bookingId"]'::jsonb),
    ('payout_approved', 'Payout Approved', 'Your payout of {{amount}} has been approved and is being processed.', 'payout', 'all', '["amount"]'::jsonb),
    ('payout_completed', 'Payout Sent', 'Your payout of {{amount}} has been sent to your {{method}} account.', 'payout', 'all', '["amount", "method"]'::jsonb),
    ('dispute_filed', 'Dispute Filed', 'A dispute has been filed for booking #{{bookingId}}. You have 24 hours to respond.', 'dispute_update', 'all', '["bookingId"]'::jsonb),
    ('dispute_resolved', 'Dispute Resolved', 'Your dispute for booking #{{bookingId}} has been resolved: {{resolution}}.', 'dispute_update', 'all', '["bookingId", "resolution"]'::jsonb),
    ('referral_bonus', 'Referral Bonus!', 'You earned {{amount}} from your referral! {{refereeName}} just completed their first booking.', 'referral', 'all', '["amount", "refereeName"]'::jsonb),
    ('suki_tier_up', 'Suki Tier Up!', 'Congratulations! You are now a {{tier}} at {{providerName}}. Enjoy {{discount}}% off your next booking!', 'suki', 'all', '["tier", "providerName", "discount"]'::jsonb),
    ('provider_approved', 'Account Approved', 'Your provider account has been approved! You can now start accepting bookings.', 'tier_upgrade', 'all', '[]'::jsonb);

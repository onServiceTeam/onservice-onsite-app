-- Phase 09 — Marketing: promo codes + campaign tracking.
-- Reuses admin_actions.action_type='config_changed' / target_type='config'
-- (already allowed by migration 055), so no CHECK widening required.

CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(40) NOT NULL UNIQUE,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed_centavos')),
    discount_value INTEGER NOT NULL CHECK (discount_value > 0),
    max_discount_centavos BIGINT,
    minimum_order_centavos BIGINT NOT NULL DEFAULT 0,
    usage_limit_total INTEGER,
    usage_limit_per_customer INTEGER NOT NULL DEFAULT 1,
    times_used INTEGER NOT NULL DEFAULT 0,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code   ON promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(active, valid_until);

CREATE TABLE IF NOT EXISTS marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL,
    channel VARCHAR(40) NOT NULL CHECK (channel IN (
        'facebook_ads','google_ads','billboard','kiosk','influencer',
        'sms','email','referral','other'
    )),
    started_at DATE NOT NULL,
    ended_at DATE,
    spend_centavos BIGINT NOT NULL DEFAULT 0,
    attributed_signups INTEGER NOT NULL DEFAULT 0,
    attributed_first_bookings INTEGER NOT NULL DEFAULT 0,
    attributed_revenue_centavos BIGINT NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_channel ON marketing_campaigns(channel, started_at DESC);

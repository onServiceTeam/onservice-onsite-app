-- Phase 5: Recurring Bookings & Provider Subscriptions
-- US-C011: Customers can set up recurring services (weekly/bi-weekly/monthly)
-- Edge Case 7: Auto-charge, auto-match substitutes, skip instances

CREATE TABLE recurring_bookings (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(id),
    category_id UUID NOT NULL REFERENCES service_categories(id),
    subcategory_id UUID REFERENCES service_subcategories(id),
    original_booking_id UUID REFERENCES bookings(id),

    frequency VARCHAR(20) NOT NULL
        CHECK (frequency IN ('weekly', 'bi_weekly', 'monthly')),
    preferred_day INTEGER NOT NULL CHECK (preferred_day BETWEEN 0 AND 6),
    preferred_time TIME NOT NULL,

    address TEXT NOT NULL,
    barangay VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),

    service_price INTEGER NOT NULL,
    service_fee INTEGER NOT NULL,
    total_amount INTEGER NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'cancelled')),

    next_booking_date DATE NOT NULL,
    last_booking_date DATE,
    skip_dates DATE[] DEFAULT '{}',

    auto_charge BOOLEAN NOT NULL DEFAULT TRUE,
    allow_substitute BOOLEAN NOT NULL DEFAULT TRUE,
    total_instances INTEGER NOT NULL DEFAULT 0,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recurring_customer ON recurring_bookings(customer_id);
CREATE INDEX idx_recurring_provider ON recurring_bookings(provider_id);
CREATE INDEX idx_recurring_status ON recurring_bookings(status) WHERE status = 'active';
CREATE INDEX idx_recurring_next_date ON recurring_bookings(next_booking_date) WHERE status = 'active';
CREATE INDEX idx_recurring_category ON recurring_bookings(category_id);

-- Track individual instances generated from recurring bookings
CREATE TABLE recurring_instances (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    recurring_booking_id UUID NOT NULL REFERENCES recurring_bookings(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id),
    scheduled_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'created', 'skipped', 'failed', 'substituted')),
    substitute_provider_id UUID REFERENCES providers(id),
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recurring_instances_recurring ON recurring_instances(recurring_booking_id);
CREATE INDEX idx_recurring_instances_booking ON recurring_instances(booking_id);
CREATE INDEX idx_recurring_instances_date ON recurring_instances(scheduled_date);

-- Provider subscription plans (Pro/Business tiers)
CREATE TABLE provider_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    plan VARCHAR(20) NOT NULL
        CHECK (plan IN ('free', 'pro', 'business')),
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'cancelled', 'expired', 'past_due')),

    monthly_price INTEGER NOT NULL DEFAULT 0,
    commission_discount DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    current_period_end TIMESTAMPTZ NOT NULL,
    cancelled_at TIMESTAMPTZ,
    payment_method VARCHAR(20),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id)
);

CREATE INDEX idx_provider_subs_provider ON provider_subscriptions(provider_id);
CREATE INDEX idx_provider_subs_status ON provider_subscriptions(status) WHERE status = 'active';
CREATE INDEX idx_provider_subs_period_end ON provider_subscriptions(current_period_end);

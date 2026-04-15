-- Phase 5 Ongoing: New Service Categories Enhancements
-- Surge/holiday pricing, smart rebooking, waitlist for fully-booked slots

-- 1. Pricing rules — admin-configurable dynamic pricing
CREATE TABLE pricing_rules (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('rush', 'holiday', 'peak_hours')),
    multiplier DECIMAL(4,2) NOT NULL CHECK (multiplier >= 1.00 AND multiplier <= 5.00),

    rush_hours_threshold INTEGER CHECK (rush_hours_threshold > 0),
    holiday_date DATE,
    peak_start_time TIME,
    peak_end_time TIME,
    peak_days_of_week SMALLINT[],

    category_id UUID REFERENCES service_categories(id) ON DELETE CASCADE,
    service_area_id UUID REFERENCES service_areas(id) ON DELETE CASCADE,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    priority INTEGER NOT NULL DEFAULT 0,
    platform_surge_share DECIMAL(3,2) NOT NULL DEFAULT 0.50
        CHECK (platform_surge_share >= 0.00 AND platform_surge_share <= 1.00),
    description TEXT NOT NULL DEFAULT '',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pricing_rule_rush_check CHECK (
        type != 'rush' OR rush_hours_threshold IS NOT NULL
    ),
    CONSTRAINT pricing_rule_holiday_check CHECK (
        type != 'holiday' OR holiday_date IS NOT NULL
    ),
    CONSTRAINT pricing_rule_peak_check CHECK (
        type != 'peak_hours' OR (peak_start_time IS NOT NULL AND peak_end_time IS NOT NULL)
    )
);

CREATE INDEX idx_pricing_rules_active ON pricing_rules(type, is_active) WHERE is_active = TRUE;
CREATE INDEX idx_pricing_rules_holiday ON pricing_rules(holiday_date) WHERE type = 'holiday' AND is_active = TRUE;
CREATE INDEX idx_pricing_rules_category ON pricing_rules(category_id) WHERE category_id IS NOT NULL;

-- 2. Add surge/rebooking columns to bookings
ALTER TABLE bookings
    ADD COLUMN IF NOT EXISTS surge_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    ADD COLUMN IF NOT EXISTS surge_amount INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pricing_rule_id UUID REFERENCES pricing_rules(id),
    ADD COLUMN IF NOT EXISTS rebooked_from_id UUID REFERENCES bookings(id);

CREATE INDEX idx_bookings_rebooked ON bookings(rebooked_from_id) WHERE rebooked_from_id IS NOT NULL;

-- 3. Booking slot waitlist
CREATE TABLE booking_slot_waitlist (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES service_categories(id),
    subcategory_id UUID REFERENCES service_subcategories(id),
    preferred_date DATE NOT NULL,
    preferred_time_start TIME NOT NULL,
    preferred_time_end TIME NOT NULL,
    city VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'notified', 'booked', 'expired', 'cancelled')),
    notified_at TIMESTAMPTZ,
    booked_booking_id UUID REFERENCES bookings(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slot_waitlist_customer ON booking_slot_waitlist(customer_id);
CREATE INDEX idx_slot_waitlist_waiting ON booking_slot_waitlist(preferred_date, city, status)
    WHERE status = 'waiting';
CREATE INDEX idx_slot_waitlist_expires ON booking_slot_waitlist(expires_at)
    WHERE status = 'waiting';

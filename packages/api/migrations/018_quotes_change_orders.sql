-- Sprint 9: Custom Quoting & Change Orders
-- Adds quote_line_items, change_orders, and job-request columns on bookings

-- Extend bookings for job requests (custom quote flow)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS urgency VARCHAR(20)
    CHECK (urgency IS NULL OR urgency IN ('same_day', 'within_3_days', 'within_a_week', 'flexible'));
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS budget_min INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS budget_max INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS job_photos TEXT[] DEFAULT '{}';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS job_video_url TEXT;

-- Extend booking_quotes with structured fields
ALTER TABLE booking_quotes ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'accepted', 'declined', 'expired', 'withdrawn'));
ALTER TABLE booking_quotes ADD COLUMN IF NOT EXISTS labor_amount INTEGER DEFAULT 0;
ALTER TABLE booking_quotes ADD COLUMN IF NOT EXISTS materials_amount INTEGER DEFAULT 0;
ALTER TABLE booking_quotes ADD COLUMN IF NOT EXISTS estimated_days INTEGER;
ALTER TABLE booking_quotes ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';
ALTER TABLE booking_quotes ADD COLUMN IF NOT EXISTS portfolio_photos TEXT[] DEFAULT '{}';
ALTER TABLE booking_quotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Quote line items
CREATE TABLE IF NOT EXISTS quote_line_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    quote_id UUID NOT NULL REFERENCES booking_quotes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit VARCHAR(30) NOT NULL DEFAULT 'unit',
    unit_price INTEGER NOT NULL,
    line_total INTEGER NOT NULL,
    item_type VARCHAR(20) NOT NULL DEFAULT 'labor'
        CHECK (item_type IN ('labor', 'materials', 'equipment', 'other')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quote_line_items_quote ON quote_line_items(quote_id);

-- Change orders
CREATE TABLE IF NOT EXISTS change_orders (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    description TEXT NOT NULL,
    additional_amount INTEGER NOT NULL,
    photos TEXT[] DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'declined')),
    customer_responded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_change_orders_booking ON change_orders(booking_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_provider ON change_orders(provider_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON change_orders(status);

-- Migration: Create bookings table
-- Status transitions enforced by application-level state machine

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL REFERENCES users(id),
    provider_id UUID REFERENCES providers(id),
    category_id UUID NOT NULL REFERENCES service_categories(id),
    subcategory_id UUID REFERENCES service_subcategories(id),
    booking_type VARCHAR(20) NOT NULL DEFAULT 'fixed_price'
        CHECK (booking_type IN ('fixed_price', 'quote_based')),
    status VARCHAR(30) NOT NULL DEFAULT 'requested'
        CHECK (status IN (
            'requested', 'quoted', 'matched', 'payment_pending', 'paid',
            'provider_en_route', 'provider_arrived', 'in_progress',
            'completed_by_provider', 'confirmed', 'disputed', 'resolved',
            'payout_ready', 'paid_out',
            'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin'
        )),
    escrow_status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (escrow_status IN ('pending', 'held', 'released', 'refunded', 'partially_refunded')),
    service_price INTEGER NOT NULL DEFAULT 0,      -- in centavos
    service_fee INTEGER NOT NULL DEFAULT 0,         -- in centavos
    total_amount INTEGER NOT NULL DEFAULT 0,        -- in centavos
    description TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL,
    barangay VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    scheduled_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    payment_method VARCHAR(20),
    payment_intent_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bookings_customer ON bookings(customer_id);
CREATE INDEX idx_bookings_provider ON bookings(provider_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_scheduled ON bookings(scheduled_at);
CREATE INDEX idx_bookings_created ON bookings(created_at);
CREATE INDEX idx_bookings_escrow ON bookings(escrow_status);

-- Booking quotes (for quote-based bookings)
CREATE TABLE booking_quotes (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES providers(id),
    quoted_price INTEGER NOT NULL,           -- in centavos
    description TEXT NOT NULL DEFAULT '',
    estimated_duration_minutes INTEGER,
    is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotes_booking ON booking_quotes(booking_id);
CREATE INDEX idx_quotes_provider ON booking_quotes(provider_id);
CREATE INDEX idx_quotes_expires ON booking_quotes(expires_at);

-- Booking images (before/after photos)
CREATE TABLE booking_images (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    image_type VARCHAR(20) NOT NULL DEFAULT 'before'
        CHECK (image_type IN ('before', 'after', 'issue')),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_booking_images_booking ON booking_images(booking_id);

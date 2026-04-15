-- Migration: Create payouts table (FR-103)
-- Tracks provider withdrawal requests and their status

CREATE TABLE payouts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    amount BIGINT NOT NULL CHECK (amount > 0),
    method VARCHAR(20) NOT NULL
        CHECK (method IN ('gcash', 'maya', 'bank_instapay', 'bank_pesonet')),
    destination_account VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'completed', 'failed')),
    paymongo_transfer_id VARCHAR(255),
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_payouts_provider ON payouts(provider_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_created ON payouts(created_at);

-- Payment intents tracking (PayMongo integration)
CREATE TABLE payment_intents (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id),
    paymongo_intent_id VARCHAR(255),
    amount BIGINT NOT NULL,
    payment_method VARCHAR(30) NOT NULL
        CHECK (payment_method IN ('gcash', 'maya', 'card', 'qrph', 'wallet', 'bank_transfer')),
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'awaiting_payment', 'processing', 'succeeded', 'failed', 'refunded', 'partially_refunded')),
    client_key VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_intents_booking ON payment_intents(booking_id);
CREATE INDEX idx_payment_intents_paymongo ON payment_intents(paymongo_intent_id);
CREATE INDEX idx_payment_intents_status ON payment_intents(status);

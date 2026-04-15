-- Migration: Create wallets and wallet_transactions tables
-- All amounts in centavos (₱500 = 50000)
-- Currency is ALWAYS PHP

CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL
        CHECK (type IN ('customer', 'provider', 'platform_escrow', 'platform_revenue', 'guarantee_fund')),
    available_balance BIGINT NOT NULL DEFAULT 0,   -- in centavos
    pending_balance BIGINT NOT NULL DEFAULT 0,     -- in centavos
    currency VARCHAR(3) NOT NULL DEFAULT 'PHP',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT positive_balance CHECK (available_balance >= 0),
    CONSTRAINT positive_pending CHECK (pending_balance >= 0)
);

CREATE UNIQUE INDEX idx_wallets_user ON wallets(user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX idx_wallets_platform ON wallets(type) WHERE user_id IS NULL;
CREATE INDEX idx_wallets_type ON wallets(type);

CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    wallet_id UUID NOT NULL REFERENCES wallets(id),
    booking_id UUID REFERENCES bookings(id),
    type VARCHAR(30) NOT NULL
        CHECK (type IN (
            'payment', 'escrow_hold', 'escrow_release', 'commission',
            'payout', 'refund', 'withdrawal', 'guarantee_contribution', 'service_fee'
        )),
    amount BIGINT NOT NULL,              -- positive = credit, negative = debit
    balance_after BIGINT NOT NULL,       -- in centavos
    description TEXT NOT NULL DEFAULT '',
    reference_id VARCHAR(255),           -- PayMongo payment ID, etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_wallet ON wallet_transactions(wallet_id);
CREATE INDEX idx_transactions_booking ON wallet_transactions(booking_id);
CREATE INDEX idx_transactions_type ON wallet_transactions(type);
CREATE INDEX idx_transactions_created ON wallet_transactions(created_at);

-- Insert platform wallets (one-time)
INSERT INTO wallets (type, currency) VALUES
    ('platform_escrow', 'PHP'),
    ('platform_revenue', 'PHP'),
    ('guarantee_fund', 'PHP');

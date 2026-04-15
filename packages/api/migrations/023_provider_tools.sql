-- Phase 5 Ongoing: Provider Tools Enhancement
-- Earnings goal tracker — providers set daily/weekly/monthly earnings targets

CREATE TABLE provider_earnings_goals (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    target_amount INTEGER NOT NULL CHECK (target_amount > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, period_type)
);

CREATE INDEX idx_provider_earnings_goals_provider ON provider_earnings_goals(provider_id) WHERE is_active = TRUE;

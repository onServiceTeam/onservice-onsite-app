-- Phase 5 Ongoing: Admin Analytics — Issues 191-200
-- A/B testing, cohort analysis, churn prediction, provider quality scoring, commission optimization

-- 1. A/B Test experiments (promo campaigns)
CREATE TABLE ab_tests (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'completed')),
    variant_a_name VARCHAR(100) NOT NULL DEFAULT 'Control',
    variant_b_name VARCHAR(100) NOT NULL DEFAULT 'Variant B',
    variant_a_config JSONB NOT NULL DEFAULT '{}',
    variant_b_config JSONB NOT NULL DEFAULT '{}',
    target_metric VARCHAR(50) NOT NULL DEFAULT 'conversion_rate'
        CHECK (target_metric IN ('conversion_rate', 'average_order_value', 'booking_count', 'revenue')),
    traffic_split DECIMAL(3,2) NOT NULL DEFAULT 0.50
        CHECK (traffic_split >= 0.10 AND traffic_split <= 0.90),
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ab_test_assignments (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    variant VARCHAR(1) NOT NULL CHECK (variant IN ('A', 'B')),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    converted BOOLEAN NOT NULL DEFAULT FALSE,
    conversion_value INTEGER DEFAULT 0,
    converted_at TIMESTAMPTZ,
    UNIQUE(test_id, user_id)
);

CREATE INDEX idx_ab_test_assignments_test ON ab_test_assignments(test_id, variant);
CREATE INDEX idx_ab_test_assignments_user ON ab_test_assignments(user_id);
CREATE INDEX idx_ab_tests_status ON ab_tests(status) WHERE status = 'active';

-- 2. Provider quality scores (auto-computed)
CREATE TABLE provider_quality_scores (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    overall_score DECIMAL(5,2) NOT NULL DEFAULT 0.00
        CHECK (overall_score >= 0.00 AND overall_score <= 100.00),
    rating_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    completion_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    timeliness_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    cancellation_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    response_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    total_jobs_scored INTEGER NOT NULL DEFAULT 0,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider_id, period_start, period_end)
);

CREATE INDEX idx_provider_quality_scores_provider ON provider_quality_scores(provider_id);
CREATE INDEX idx_provider_quality_scores_period ON provider_quality_scores(period_start, period_end);

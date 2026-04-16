-- Promotions / banners system for home screen carousel and targeted offers
-- Supports active promo management by admins

CREATE TABLE promotions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(200) NOT NULL,
    subtitle TEXT,
    image_url TEXT,
    badge VARCHAR(30),
    cta_text VARCHAR(50),
    cta_link VARCHAR(500),
    target_audience VARCHAR(30) NOT NULL DEFAULT 'all'
        CHECK (target_audience IN ('all', 'new_customers', 'returning', 'providers')),
    start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_promotions_active ON promotions(is_active, start_date, end_date)
    WHERE is_active = TRUE;
CREATE INDEX idx_promotions_audience ON promotions(target_audience);

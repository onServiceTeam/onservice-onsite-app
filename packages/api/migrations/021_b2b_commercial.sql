-- Phase 5: B2B / Commercial Tier
-- Offices, condo management companies, restaurants, hotels
-- Recurring contracts with volume discounts, dedicated account managers, monthly invoicing

CREATE TABLE business_accounts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    company_name VARCHAR(200) NOT NULL,
    business_type VARCHAR(30) NOT NULL
        CHECK (business_type IN ('office', 'condo_management', 'restaurant', 'hotel', 'retail', 'school', 'hospital', 'other')),
    registration_number VARCHAR(100),
    tax_id VARCHAR(50),

    billing_address TEXT NOT NULL,
    barangay VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    province VARCHAR(100) NOT NULL,

    contact_person VARCHAR(200) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(20) NOT NULL,

    account_manager_id UUID REFERENCES users(id),
    owner_user_id UUID NOT NULL REFERENCES users(id),

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'suspended', 'closed')),

    payment_terms VARCHAR(20) NOT NULL DEFAULT 'net_30'
        CHECK (payment_terms IN ('net_15', 'net_30', 'net_60')),
    volume_discount_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    monthly_credit_limit INTEGER NOT NULL DEFAULT 0,

    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_accounts_owner ON business_accounts(owner_user_id);
CREATE INDEX idx_business_accounts_manager ON business_accounts(account_manager_id);
CREATE INDEX idx_business_accounts_status ON business_accounts(status) WHERE status = 'active';
CREATE INDEX idx_business_accounts_city ON business_accounts(city);

CREATE TABLE business_members (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    business_account_id UUID NOT NULL REFERENCES business_accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member'
        CHECK (role IN ('owner', 'manager', 'member')),
    can_book BOOLEAN NOT NULL DEFAULT TRUE,
    can_approve BOOLEAN NOT NULL DEFAULT FALSE,
    can_view_invoices BOOLEAN NOT NULL DEFAULT FALSE,
    invited_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(business_account_id, user_id)
);

CREATE INDEX idx_business_members_account ON business_members(business_account_id);
CREATE INDEX idx_business_members_user ON business_members(user_id);

CREATE TABLE business_contracts (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    business_account_id UUID NOT NULL REFERENCES business_accounts(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES service_categories(id),
    subcategory_id UUID REFERENCES service_subcategories(id),
    provider_id UUID REFERENCES providers(id),

    contract_type VARCHAR(20) NOT NULL
        CHECK (contract_type IN ('recurring', 'on_demand')),
    frequency VARCHAR(20)
        CHECK (frequency IS NULL OR frequency IN ('weekly', 'bi_weekly', 'monthly', 'quarterly', 'as_needed')),

    agreed_rate INTEGER NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    estimated_monthly_value INTEGER NOT NULL DEFAULT 0,

    start_date DATE NOT NULL,
    end_date DATE,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,

    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'expired', 'cancelled')),

    terms TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_contracts_account ON business_contracts(business_account_id);
CREATE INDEX idx_business_contracts_category ON business_contracts(category_id);
CREATE INDEX idx_business_contracts_provider ON business_contracts(provider_id);
CREATE INDEX idx_business_contracts_status ON business_contracts(status) WHERE status = 'active';

CREATE TABLE business_invoices (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    business_account_id UUID NOT NULL REFERENCES business_accounts(id) ON DELETE CASCADE,
    invoice_number VARCHAR(30) NOT NULL UNIQUE,

    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,

    subtotal INTEGER NOT NULL DEFAULT 0,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    tax_amount INTEGER NOT NULL DEFAULT 0,
    total_amount INTEGER NOT NULL DEFAULT 0,

    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled', 'void')),

    due_date DATE NOT NULL,
    paid_at TIMESTAMPTZ,
    payment_reference VARCHAR(100),

    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_invoices_account ON business_invoices(business_account_id);
CREATE INDEX idx_business_invoices_status ON business_invoices(status);
CREATE INDEX idx_business_invoices_due_date ON business_invoices(due_date) WHERE status IN ('sent', 'overdue');
CREATE INDEX idx_business_invoices_number ON business_invoices(invoice_number);

CREATE TABLE business_invoice_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    invoice_id UUID NOT NULL REFERENCES business_invoices(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id),
    contract_id UUID REFERENCES business_contracts(id),

    description TEXT NOT NULL,
    service_date DATE,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price INTEGER NOT NULL,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    amount INTEGER NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_invoice_items_invoice ON business_invoice_items(invoice_id);
CREATE INDEX idx_business_invoice_items_booking ON business_invoice_items(booking_id);

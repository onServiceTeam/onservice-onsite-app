-- D27 Phase 7b — provider CRM depth on top of the client book (Phase 7).
--
-- Three independent, no-money-risk features:
--   1. Client notes      — free-text notes a provider keeps on a customer.
--   2. Client reminders  — "follow up on DATE" that fires a provider notification.
--   3. Quote templates   — reusable line-item sets the provider one-taps into a quote.
-- (Per-category insights are read-only aggregations, no schema needed.)

-- 1. Notes a provider keeps on one of their customers.
CREATE TABLE IF NOT EXISTS provider_client_notes (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_client_notes_pc ON provider_client_notes(provider_id, customer_id);

-- 2. Follow-up reminders. customer_id is optional (a general reminder vs one
-- about a specific client). A daily sweep flips due 'pending' rows, sends the
-- provider a notification, and stamps fired_at so it only fires once.
CREATE TABLE IF NOT EXISTS provider_client_reminders (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(200) NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'done')),
    fired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_reminders_provider ON provider_client_reminders(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_provider_reminders_due ON provider_client_reminders(due_date) WHERE status = 'pending';

-- 3. Reusable quote templates (a named set of line items, optionally scoped to a
-- category/subcategory) that prefill the quote builder.
CREATE TABLE IF NOT EXISTS provider_quote_templates (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
    subcategory_id UUID REFERENCES service_subcategories(id) ON DELETE SET NULL,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_provider_quote_templates_provider ON provider_quote_templates(provider_id);

CREATE TABLE IF NOT EXISTS provider_quote_template_items (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    template_id UUID NOT NULL REFERENCES provider_quote_templates(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit VARCHAR(30) NOT NULL DEFAULT 'unit',
    unit_price INTEGER NOT NULL,
    item_type VARCHAR(20) NOT NULL DEFAULT 'labor'
        CHECK (item_type IN ('labor', 'materials', 'equipment', 'other')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quote_template_items_template ON provider_quote_template_items(template_id);

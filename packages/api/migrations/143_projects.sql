-- D27 Phase 5 — project layer for big multi-stage jobs (home building, interior
-- design, roof, condo complexes).
--
-- A project groups milestones (stages with progress), selections (the customer's
-- material/colour/finish choices), and documents (blueprints, permits, contract).
-- This is the planning + progress-tracking layer. Money does NOT move per
-- milestone yet — `milestone.amount` is display/planning only. Per-milestone
-- escrow release is a Ken decision: .ai-coder/decisions/D27p5-milestone-escrow.md

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_id UUID REFERENCES providers(id) ON DELETE SET NULL,
    category_id UUID REFERENCES service_categories(id) ON DELETE SET NULL,
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    address TEXT,
    city VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'active', 'on_hold', 'completed', 'cancelled')),
    -- Planning total in centavos (sum of milestone amounts, advisory only).
    estimated_total INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_provider ON projects(provider_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

CREATE TABLE IF NOT EXISTS project_milestones (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed')),
    -- Advisory planning amount (centavos). NOT charged here — see decision file.
    amount INTEGER,
    target_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON project_milestones(project_id);

CREATE TABLE IF NOT EXISTS project_selections (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- e.g. category='Door', label='Material', value='Solid oak', detail='RAL 9010'.
    category VARCHAR(80) NOT NULL,
    label VARCHAR(120) NOT NULL,
    value VARCHAR(200) NOT NULL,
    detail VARCHAR(200),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_selections_project ON project_selections(project_id);

CREATE TABLE IF NOT EXISTS project_documents (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label VARCHAR(160) NOT NULL,
    file_url TEXT NOT NULL,
    doc_type VARCHAR(20) NOT NULL DEFAULT 'other'
        CHECK (doc_type IN ('blueprint', 'permit', 'contract', 'photo', 'other')),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);

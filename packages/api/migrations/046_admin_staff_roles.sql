-- Migration 046: Admin Staff & Roles
-- Supports admin Screen 13: Staff / Roles / Permissions

CREATE TABLE IF NOT EXISTS admin_roles (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_staff (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  role_id UUID NOT NULL REFERENCES admin_roles(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_staff_user ON admin_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_staff_role ON admin_staff(role_id);
CREATE INDEX IF NOT EXISTS idx_admin_staff_active ON admin_staff(is_active);

-- Seed default roles
INSERT INTO admin_roles (name, description, permissions) VALUES
  ('super_admin', 'Full platform access', ARRAY[
    'dashboard.view', 'providers.view', 'providers.manage', 'customers.view', 'customers.manage',
    'bookings.view', 'bookings.manage', 'catalog.view', 'catalog.manage',
    'disputes.view', 'disputes.manage', 'financials.view',
    'payouts.view', 'payouts.manage', 'templates.view', 'templates.manage',
    'analytics.view', 'audit.view', 'settings.view', 'settings.manage',
    'staff.view', 'staff.manage', 'support.view', 'support.manage'
  ]),
  ('admin', 'Standard admin access', ARRAY[
    'dashboard.view', 'providers.view', 'providers.manage', 'customers.view', 'customers.manage',
    'bookings.view', 'bookings.manage', 'catalog.view', 'catalog.manage',
    'disputes.view', 'disputes.manage', 'financials.view',
    'payouts.view', 'payouts.manage', 'templates.view', 'templates.manage',
    'analytics.view', 'audit.view', 'support.view', 'support.manage'
  ]),
  ('support_agent', 'Support ticket management', ARRAY[
    'dashboard.view', 'customers.view', 'bookings.view', 'support.view', 'support.manage'
  ]),
  ('finance', 'Financial oversight', ARRAY[
    'dashboard.view', 'financials.view', 'payouts.view', 'payouts.manage', 'analytics.view', 'audit.view'
  ]),
  ('moderator', 'Content moderation', ARRAY[
    'dashboard.view', 'disputes.view', 'disputes.manage', 'customers.view', 'providers.view'
  ])
ON CONFLICT (name) DO NOTHING;

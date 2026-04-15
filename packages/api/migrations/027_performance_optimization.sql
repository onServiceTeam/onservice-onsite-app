-- Phase 5 Medium Issues 71-90: Performance Optimization
-- Additional indexes and query plan improvements not covered by migration 019

-- Conversations: index for user message feed lookup
CREATE INDEX IF NOT EXISTS idx_conversations_customer
  ON conversations(customer_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_provider
  ON conversations(provider_id, updated_at DESC);

-- Messages: index for conversation message pagination
CREATE INDEX IF NOT EXISTS idx_messages_conversation_date
  ON messages(conversation_id, created_at DESC);

-- Login attempts: index for cleanup job and lockout lookups
CREATE INDEX IF NOT EXISTS idx_login_attempts_created
  ON login_attempts(created_at);

-- Data export requests: index for pending processing job
CREATE INDEX IF NOT EXISTS idx_data_exports_pending
  ON data_export_requests(status, created_at ASC)
  WHERE status = 'pending';

-- Account deletion requests: index for cooling-off expiry job
CREATE INDEX IF NOT EXISTS idx_deletion_cooling_off
  ON account_deletion_requests(status, cooling_off_ends_at)
  WHERE status = 'pending';

-- Service areas: active area lookups by slug
CREATE INDEX IF NOT EXISTS idx_service_areas_active
  ON service_areas(status, slug)
  WHERE status = 'active';

-- Provider NBI clearance expiry check
CREATE INDEX IF NOT EXISTS idx_providers_nbi_expiry
  ON providers(nbi_expiry_date)
  WHERE nbi_expiry_date IS NOT NULL AND status = 'approved';

-- Business invoices: overdue check job
CREATE INDEX IF NOT EXISTS idx_business_invoices_overdue
  ON business_invoices(status, due_date)
  WHERE status = 'sent';

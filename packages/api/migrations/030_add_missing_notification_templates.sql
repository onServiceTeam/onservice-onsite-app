-- Migration: Add missing notification template seeds
-- new_job_available: used by notifyProviderNewJob but not previously seeded
-- booking_matched: used by notifyCustomerProviderAssigned

INSERT INTO notification_templates (slug, title_template, body_template, type, channel, variables)
VALUES (
  'new_job_available',
  'New Job Available',
  '{{serviceName}} in {{city}} — {{amount}}. Tap to view and submit a quote.',
  'booking_update',
  'all',
  '["bookingId", "serviceName", "amount", "city"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO notification_templates (slug, title_template, body_template, type, channel, variables)
VALUES (
  'booking_matched',
  'Provider Assigned',
  'A provider has been matched for your {{serviceName}} booking. Tap to view details.',
  'booking_update',
  'all',
  '["bookingId", "serviceName", "providerName"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

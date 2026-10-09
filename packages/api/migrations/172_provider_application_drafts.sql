-- E35 / E74: private, typed, expiring UNsubmitted application drafts.
-- This does not create a second approval state, migrate legacy progress,
-- backfill providers, grant roles, or change historical application evidence.
-- The service validates every field and nested questionnaire member before
-- writing. General audit logs must never contain application_fields.

CREATE TABLE provider_application_drafts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision UUID NOT NULL,
  application_fields JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT provider_application_draft_object CHECK (jsonb_typeof(application_fields) = 'object'),
  CONSTRAINT provider_application_draft_size CHECK (octet_length(application_fields::text) <= 20000),
  CONSTRAINT provider_application_draft_fields CHECK (
    application_fields - ARRAY[
      'businessName', 'categoryIds', 'serviceAreaId', 'serviceRadiusKm',
      'latitude', 'longitude', 'city', 'province', 'governmentIdFrontUrl',
      'governmentIdBackUrl', 'nbiClearanceUrl', 'selfieUrl', 'nbiExpiryDate',
      'governmentIdNumber', 'yearsExperience', 'vettingAnswers'
    ]::text[] = '{}'::jsonb
  ),
  CONSTRAINT provider_application_draft_lifetime CHECK (expires_at > saved_at AND saved_at >= created_at),
  CONSTRAINT provider_application_draft_owned_front CHECK (
    application_fields ->> 'governmentIdFrontUrl' IS NULL OR
    starts_with(application_fields ->> 'governmentIdFrontUrl', 'onboarding/' || user_id::text || '/')
  ),
  CONSTRAINT provider_application_draft_owned_back CHECK (
    application_fields ->> 'governmentIdBackUrl' IS NULL OR
    starts_with(application_fields ->> 'governmentIdBackUrl', 'onboarding/' || user_id::text || '/')
  ),
  CONSTRAINT provider_application_draft_owned_nbi CHECK (
    application_fields ->> 'nbiClearanceUrl' IS NULL OR
    starts_with(application_fields ->> 'nbiClearanceUrl', 'onboarding/' || user_id::text || '/')
  ),
  CONSTRAINT provider_application_draft_owned_selfie CHECK (
    application_fields ->> 'selfieUrl' IS NULL OR
    starts_with(application_fields ->> 'selfieUrl', 'onboarding/' || user_id::text || '/')
  )
);

CREATE INDEX provider_application_drafts_expiry ON provider_application_drafts (expires_at, user_id);

COMMENT ON TABLE provider_application_drafts IS
  'Owner-only unsubmitted application data. Expiry hides drafts; bounded cleanup removes these rows, not uploaded objects or backups. No approval or agreement-acceptance authority.';

-- E35/E74: preserve newly submitted application evidence independently of
-- mutable provider profiles/catalogs. No legacy snapshot, approval, role grant,
-- backfill, or resubmission endpoint is created by this migration.
ALTER TABLE providers ADD CONSTRAINT provider_application_owner_identity UNIQUE (id, user_id);

CREATE TABLE provider_application_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES providers(id),
  submitted_by UUID NOT NULL REFERENCES users(id),
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  previous_revision_number INTEGER,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  business_name VARCHAR(200) NOT NULL,
  service_radius_km INTEGER NOT NULL CHECK (service_radius_km BETWEEN 1 AND 100),
  latitude NUMERIC NOT NULL CHECK (latitude BETWEEN 4.5 AND 21.5),
  longitude NUMERIC NOT NULL CHECK (longitude BETWEEN 116 AND 127.5),
  city VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  -- Historical catalog identity AND labels, not a live join or priced services.
  -- No catalog FK: later catalog retirement must not rewrite/delete evidence.
  service_area_id UUID NOT NULL,
  service_area_name TEXT NOT NULL,
  category_ids UUID[] NOT NULL,
  category_names TEXT[] NOT NULL,
  government_id_front_key TEXT NOT NULL,
  government_id_back_key TEXT NOT NULL,
  nbi_clearance_key TEXT NOT NULL,
  selfie_key TEXT NOT NULL,
  nbi_expiry_date DATE,
  government_id_number VARCHAR(64),
  years_experience INTEGER CHECK (years_experience BETWEEN 0 AND 60),
  vetting_answers JSONB,
  agreement_accepted_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_id, revision_number),
  UNIQUE (provider_id, id),
  FOREIGN KEY (provider_id, submitted_by) REFERENCES providers(id, user_id),
  FOREIGN KEY (provider_id, previous_revision_number)
    REFERENCES provider_application_revisions(provider_id, revision_number),
  CHECK (
    (revision_number = 1 AND previous_revision_number IS NULL)
    OR (revision_number > 1 AND previous_revision_number IS NOT NULL
        AND previous_revision_number = revision_number - 1)
  ),
  CHECK (agreement_accepted_at <= submitted_at AND submitted_at <= recorded_at),
  CHECK (cardinality(category_ids) BETWEEN 1 AND 10
    AND array_ndims(category_ids) = 1 AND array_lower(category_ids, 1) = 1
    AND array_position(category_ids, NULL) IS NULL),
  CHECK (cardinality(category_names) = cardinality(category_ids)
    AND array_ndims(category_names) = 1 AND array_lower(category_names, 1) = 1
    AND array_position(category_names, NULL) IS NULL
    AND octet_length(category_names::text) <= 12000),
  CHECK (octet_length(service_area_name) <= 4000),
  CHECK (vetting_answers IS NULL OR (
    jsonb_typeof(vetting_answers) = 'object'
    AND octet_length(vetting_answers::text) <= 20000
    AND vetting_answers - ARRAY[
      'mainSkills', 'hasOwnTools', 'businessType', 'yearStarted', 'teamSize',
      'fullAddress', 'website', 'facebook', 'socialOther', 'credentials',
      'registrations', 'resumeUrl', 'references'
    ]::text[] = '{}'::jsonb
  )),
  CHECK (starts_with(government_id_front_key, 'onboarding/' || submitted_by::text || '/')
    AND char_length(government_id_front_key) BETWEEN 49 AND 2048),
  CHECK (starts_with(government_id_back_key, 'onboarding/' || submitted_by::text || '/')
    AND char_length(government_id_back_key) BETWEEN 49 AND 2048),
  CHECK (starts_with(nbi_clearance_key, 'onboarding/' || submitted_by::text || '/')
    AND char_length(nbi_clearance_key) BETWEEN 49 AND 2048),
  CHECK (starts_with(selfie_key, 'onboarding/' || submitted_by::text || '/')
    AND char_length(selfie_key) BETWEEN 49 AND 2048)
);

CREATE INDEX provider_application_revisions_owner
  ON provider_application_revisions(submitted_by, submitted_at, id);

CREATE FUNCTION reject_provider_application_revision_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Submitted application evidence cannot be overwritten or routinely deleted'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER provider_application_revisions_immutable
BEFORE UPDATE OR DELETE OR TRUNCATE ON provider_application_revisions
FOR EACH STATEMENT EXECUTE FUNCTION reject_provider_application_revision_mutation();

COMMENT ON TABLE provider_application_revisions IS
  'Private submitted evidence, not approval authority. Only new submissions are captured. No legacy reconstruction. Routine mutation is blocked; governed retention/erasure and backup handling remain separate E21 release requirements, not an indefinite-retention policy.';

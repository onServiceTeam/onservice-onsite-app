-- Pricing rules control customer charges and the provider/platform surge split.
-- New rules must therefore move through an explicit draft, authoritative
-- preview, publication, and retirement lifecycle. Existing rows keep their
-- current active state and are labelled as legacy for production inventory.

ALTER TABLE pricing_rules
  ADD COLUMN publication_status VARCHAR(20),
  ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN draft_reason TEXT,
  ADD COLUMN published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN published_at TIMESTAMPTZ,
  ADD COLUMN publish_reason TEXT,
  ADD COLUMN retired_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN retired_at TIMESTAMPTZ,
  ADD COLUMN retire_reason TEXT;

UPDATE pricing_rules
   SET publication_status = CASE
     WHEN is_active THEN 'legacy_active'
     ELSE 'legacy_inactive'
   END
 WHERE publication_status IS NULL;

ALTER TABLE pricing_rules
  ALTER COLUMN publication_status SET DEFAULT 'draft',
  ALTER COLUMN publication_status SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT FALSE,
  ADD CONSTRAINT pricing_rules_publication_status_check
    CHECK (publication_status IN (
      'draft', 'published', 'retired', 'legacy_active', 'legacy_inactive'
    )),
  ADD CONSTRAINT pricing_rules_publication_active_check
    CHECK (
      (publication_status IN ('published', 'legacy_active') AND is_active = TRUE)
      OR
      (publication_status IN ('draft', 'retired', 'legacy_inactive') AND is_active = FALSE)
    );

-- Scope records are operationally retired, not physically cascaded through
-- financial history. Prevent a future category/area delete from erasing a
-- pricing rule and invalidating booking evidence.
ALTER TABLE pricing_rules
  DROP CONSTRAINT pricing_rules_category_id_fkey,
  DROP CONSTRAINT pricing_rules_service_area_id_fkey,
  ADD CONSTRAINT pricing_rules_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES service_categories(id) ON DELETE RESTRICT,
  ADD CONSTRAINT pricing_rules_service_area_id_fkey
    FOREIGN KEY (service_area_id) REFERENCES service_areas(id) ON DELETE RESTRICT;

CREATE INDEX idx_pricing_rules_publication_status
    ON pricing_rules(publication_status, updated_at DESC);

-- A preview is a short-lived, server-created receipt. Publication accepts only
-- a receipt produced by the same operator for the unchanged draft and active
-- rule set. Inputs and outputs are retained for audit reconstruction.
CREATE TABLE pricing_rule_previews (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    pricing_rule_id UUID NOT NULL REFERENCES pricing_rules(id),
    created_by UUID NOT NULL REFERENCES users(id),
    rule_updated_at TIMESTAMPTZ NOT NULL,
    resolver_fingerprint VARCHAR(64) NOT NULL,
    sample_inputs JSONB NOT NULL,
    sample_results JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pricing_rule_previews_inputs_array_check
      CHECK (jsonb_typeof(sample_inputs) = 'array'),
    CONSTRAINT pricing_rule_previews_results_array_check
      CHECK (jsonb_typeof(sample_results) = 'array')
);

CREATE INDEX idx_pricing_rule_previews_rule_created
    ON pricing_rule_previews(pricing_rule_id, created_at DESC);
CREATE INDEX idx_pricing_rule_previews_expiry
    ON pricing_rule_previews(expires_at);

-- Application publication code needs to retire a record, but never rewrite
-- the pricing terms of a published, retired, or legacy record. Enforce that at
-- the database boundary as defense in depth.
CREATE OR REPLACE FUNCTION protect_pricing_rule_financial_terms()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT (
    (OLD.publication_status = 'draft' AND NEW.publication_status IN ('draft', 'published', 'retired'))
    OR (OLD.publication_status = 'published' AND NEW.publication_status IN ('published', 'retired'))
    OR (OLD.publication_status = 'retired' AND NEW.publication_status = 'retired')
    OR (OLD.publication_status = 'legacy_active' AND NEW.publication_status IN ('legacy_active', 'retired'))
    OR (OLD.publication_status = 'legacy_inactive' AND NEW.publication_status IN ('legacy_inactive', 'retired'))
  ) THEN
    RAISE EXCEPTION 'Invalid pricing-rule lifecycle transition from % to %.',
      OLD.publication_status, NEW.publication_status;
  END IF;

  IF OLD.publication_status IN ('published', 'retired', 'legacy_active', 'legacy_inactive')
     AND (
       NEW.name IS DISTINCT FROM OLD.name
       OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.multiplier IS DISTINCT FROM OLD.multiplier
       OR NEW.rush_hours_threshold IS DISTINCT FROM OLD.rush_hours_threshold
       OR NEW.holiday_date IS DISTINCT FROM OLD.holiday_date
       OR NEW.peak_start_time IS DISTINCT FROM OLD.peak_start_time
       OR NEW.peak_end_time IS DISTINCT FROM OLD.peak_end_time
       OR NEW.peak_days_of_week IS DISTINCT FROM OLD.peak_days_of_week
       OR NEW.category_id IS DISTINCT FROM OLD.category_id
       OR NEW.service_area_id IS DISTINCT FROM OLD.service_area_id
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.platform_surge_share IS DISTINCT FROM OLD.platform_surge_share
       OR NEW.description IS DISTINCT FROM OLD.description
     ) THEN
    RAISE EXCEPTION 'Published pricing-rule financial terms are immutable.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pricing_rules_financial_terms_immutable
BEFORE UPDATE ON pricing_rules
FOR EACH ROW EXECUTE FUNCTION protect_pricing_rule_financial_terms();

COMMENT ON COLUMN pricing_rules.publication_status IS
  'Draft-preview-publish-retire lifecycle. legacy_* preserves pre-migration state for operator review.';
COMMENT ON TABLE pricing_rule_previews IS
  'Short-lived authoritative pricing previews required before publication.';

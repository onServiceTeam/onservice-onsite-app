-- Migration 162: immutable, versioned booking financial terms and
-- effective-dated commission agreements.
--
-- E50 proved that escrow release was reading the provider's current tier and
-- current commission settings. A later settings/tier change could therefore
-- alter an older paid booking. This migration is deliberately additive and
-- DOES NOT backfill held production bookings. Those rows require reviewed
-- historical terms before release can switch to the snapshot contract.

CREATE TABLE commission_rate_versions (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    scope_type VARCHAR(20) NOT NULL
        CHECK (scope_type IN ('tier', 'provider', 'booking')),
    tier VARCHAR(20)
        CHECK (tier IS NULL OR tier IN ('founding', 'new', 'verified', 'pro', 'elite')),
    provider_id UUID REFERENCES providers(id),
    booking_id UUID REFERENCES bookings(id),
    service_category_id UUID REFERENCES service_categories(id),
    service_subcategory_id UUID REFERENCES service_subcategories(id),
    rate_basis_points INTEGER NOT NULL
        CHECK (rate_basis_points >= 0 AND rate_basis_points <= 5000),
    effective_from TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 10),
    created_by UUID REFERENCES users(id),
    approved_by UUID REFERENCES users(id),
    source VARCHAR(30) NOT NULL
        CHECK (source IN ('migration_seed', 'admin_schedule', 'provider_contract', 'legacy_review')),
    source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (scope_type = 'tier' AND tier IS NOT NULL AND provider_id IS NULL AND booking_id IS NULL)
      OR (scope_type = 'provider' AND provider_id IS NOT NULL AND tier IS NULL AND booking_id IS NULL)
      OR (scope_type = 'booking' AND booking_id IS NOT NULL AND tier IS NULL AND provider_id IS NULL)
    ),
    CHECK (service_subcategory_id IS NULL OR service_category_id IS NOT NULL),
    CHECK (
      (source = 'migration_seed' AND scope_type = 'tier')
      OR (source = 'admin_schedule' AND scope_type = 'tier')
      OR (source = 'provider_contract' AND scope_type = 'provider')
      OR (source = 'legacy_review' AND scope_type = 'booking')
    )
);

CREATE UNIQUE INDEX commission_rate_versions_scope_effective_unique
    ON commission_rate_versions (
      scope_type,
      COALESCE(tier, ''),
      COALESCE(provider_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(booking_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(service_category_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(service_subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid),
      effective_from
    );

CREATE INDEX commission_rate_versions_provider_lookup
    ON commission_rate_versions (
      provider_id, service_subcategory_id, service_category_id, effective_from DESC
    )
    WHERE scope_type = 'provider';

CREATE INDEX commission_rate_versions_tier_lookup
    ON commission_rate_versions (
      tier, service_subcategory_id, service_category_id, effective_from DESC
    )
    WHERE scope_type = 'tier';

CREATE UNIQUE INDEX commission_rate_versions_booking_evidence
    ON commission_rate_versions (booking_id)
    WHERE scope_type = 'booking';

-- Cancellation is append-only evidence. The rate row itself is never edited.
-- Only a future version may be cancelled by the application service.
CREATE TABLE commission_rate_version_cancellations (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    commission_rate_version_id UUID NOT NULL UNIQUE
        REFERENCES commission_rate_versions(id),
    cancelled_by UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 10),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE booking_financial_terms (
    id UUID PRIMARY KEY DEFAULT uuidv7(),
    booking_id UUID NOT NULL REFERENCES bookings(id),
    version INTEGER NOT NULL CHECK (version > 0),
    supersedes_terms_id UUID REFERENCES booking_financial_terms(id),
    terms_state VARCHAR(20) NOT NULL
        CHECK (terms_state IN ('provisional', 'final')),
    pricing_version VARCHAR(30) NOT NULL DEFAULT 'booking-v1',

    provider_id UUID REFERENCES providers(id),
    provider_tier VARCHAR(20),
    commission_source VARCHAR(30)
        CHECK (commission_source IN ('tier_default', 'provider_contract', 'manual_quote', 'legacy_review')),
    commission_rate_version_id UUID REFERENCES commission_rate_versions(id),
    commission_rate_basis_points INTEGER
        CHECK (commission_rate_basis_points >= 0 AND commission_rate_basis_points <= 10000),

    service_price_centavos BIGINT NOT NULL CHECK (service_price_centavos >= 0),
    service_fee_rate_basis_points INTEGER NOT NULL
        CHECK (service_fee_rate_basis_points >= 0 AND service_fee_rate_basis_points <= 10000),
    service_fee_min_centavos BIGINT NOT NULL CHECK (service_fee_min_centavos >= 0),
    service_fee_max_centavos BIGINT NOT NULL CHECK (service_fee_max_centavos >= service_fee_min_centavos),
    service_fee_amount_centavos BIGINT NOT NULL CHECK (service_fee_amount_centavos >= 0),
    guarantee_fund_rate_basis_points INTEGER NOT NULL
        CHECK (guarantee_fund_rate_basis_points >= 0 AND guarantee_fund_rate_basis_points <= 10000),
    guarantee_fund_amount_centavos BIGINT NOT NULL CHECK (guarantee_fund_amount_centavos >= 0),
    commission_amount_centavos BIGINT CHECK (commission_amount_centavos >= 0),
    provider_receives_centavos BIGINT CHECK (provider_receives_centavos >= 0),
    platform_retains_centavos BIGINT CHECK (platform_retains_centavos >= 0),
    total_amount_centavos BIGINT NOT NULL CHECK (total_amount_centavos >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),

    cancellation_policy JSONB NOT NULL,
    setting_sources JSONB NOT NULL DEFAULT '{}'::jsonb,
    fixed_by_event VARCHAR(40) NOT NULL
        CHECK (fixed_by_event IN (
          'wallet_payment_authorized',
          'external_payment_authorized',
          'recurring_payment_authorized',
          'provider_assigned',
          'provider_reassigned',
          'change_order_authorized',
          'hourly_settled',
          'admin_financial_correction',
          'legacy_reviewed_backfill'
        )),
    source_event_id TEXT NOT NULL CHECK (char_length(trim(source_event_id)) > 0),
    fixed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    UNIQUE (booking_id, version),
    UNIQUE (booking_id, id),
    UNIQUE (booking_id, fixed_by_event, source_event_id),
    FOREIGN KEY (booking_id, supersedes_terms_id)
      REFERENCES booking_financial_terms (booking_id, id),
    CHECK (total_amount_centavos = service_price_centavos + service_fee_amount_centavos),
    CHECK (guarantee_fund_amount_centavos <= service_fee_amount_centavos),
    CHECK (
      (terms_state = 'provisional'
        AND provider_id IS NULL
        AND provider_tier IS NULL
        AND commission_source IS NULL
        AND commission_rate_version_id IS NULL
        AND commission_rate_basis_points IS NULL
        AND commission_amount_centavos IS NULL
        AND provider_receives_centavos IS NULL
        AND platform_retains_centavos IS NULL)
      OR
      (terms_state = 'final'
        AND provider_id IS NOT NULL
        AND provider_tier IS NOT NULL
        AND commission_source IS NOT NULL
        AND commission_rate_version_id IS NOT NULL
        AND commission_rate_basis_points IS NOT NULL
        AND commission_amount_centavos IS NOT NULL
        AND provider_receives_centavos IS NOT NULL
        AND platform_retains_centavos IS NOT NULL
        AND commission_amount_centavos <= service_price_centavos
        AND provider_receives_centavos = service_price_centavos - commission_amount_centavos
        AND platform_retains_centavos = commission_amount_centavos
            + service_fee_amount_centavos - guarantee_fund_amount_centavos
        AND provider_receives_centavos + platform_retains_centavos
            + guarantee_fund_amount_centavos = total_amount_centavos)
    )
);

CREATE INDEX booking_financial_terms_booking_version
    ON booking_financial_terms (booking_id, version DESC);
CREATE INDEX booking_financial_terms_provider
    ON booking_financial_terms (provider_id, fixed_at DESC)
    WHERE provider_id IS NOT NULL;

-- Financial terms and commission versions are evidence, not mutable state.
CREATE OR REPLACE FUNCTION reject_immutable_financial_record_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable; append a new version instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER booking_financial_terms_immutable
BEFORE UPDATE OR DELETE ON booking_financial_terms
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_record_mutation();

CREATE TRIGGER commission_rate_versions_immutable
BEFORE UPDATE OR DELETE ON commission_rate_versions
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_record_mutation();

CREATE TRIGGER commission_rate_cancellations_immutable
BEFORE UPDATE OR DELETE ON commission_rate_version_cancellations
FOR EACH ROW EXECUTE FUNCTION reject_immutable_financial_record_mutation();

-- Seed only the prospective tier schedule. This does not assert that today's
-- rows governed any historical paid booking.
INSERT INTO commission_rate_versions (
  scope_type,
  tier,
  rate_basis_points,
  effective_from,
  reason,
  source,
  source_metadata
)
SELECT
  'tier',
  substring(key FROM length('commission_rate_') + 1),
  round(value::numeric * 100)::integer,
  clock_timestamp(),
  'Initial prospective tier rate copied from platform settings.',
  'migration_seed',
  jsonb_build_object(
    'settingKey', key,
    'settingValue', value,
    'settingUpdatedAt', updated_at
  )
FROM platform_settings
WHERE key IN (
    'commission_rate_founding',
    'commission_rate_new',
    'commission_rate_verified',
    'commission_rate_pro',
    'commission_rate_elite'
  )
  AND value ~ '^[0-9]+(?:\.[0-9]+)?$';

-- Scheduling and cancelling a commission agreement are explicit audited
-- decisions. Append the verbs to the live constraint without losing any verb
-- introduced by prior migrations.
DO $migration_162_action$
DECLARE
  current_def TEXT;
  appendage TEXT;
  missing_verbs TEXT[] := ARRAY[
    'commission_rate_scheduled',
    'commission_rate_cancelled',
    'legacy_financial_terms_reviewed'
  ];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
    FROM pg_constraint
   WHERE conname = 'admin_actions_action_type_check'
     AND conrelid = 'admin_actions'::regclass;

  IF current_def IS NULL THEN
    RAISE EXCEPTION 'admin_actions_action_type_check not found.';
  END IF;

  SELECT string_agg(format('(%L::character varying)::text', item.value), ', ')
    INTO appendage
    FROM unnest(missing_verbs) AS item(value)
   WHERE position('''' || item.value || '''::character varying' IN current_def) = 0;

  IF appendage IS NULL THEN
    RAISE NOTICE 'Migration 162 — commission control verbs already allowed.';
  ELSE
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    EXECUTE format(
      'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
      regexp_replace(current_def, '\]\)\)\)$', ', ' || appendage || '])))')
    );
  END IF;
END
$migration_162_action$;

CREATE VIEW booking_financial_terms_current AS
SELECT DISTINCT ON (booking_id) *
FROM booking_financial_terms
ORDER BY booking_id, version DESC;

-- Read-only inventory for the separately reviewed legacy migration. A row in
-- this view must never be auto-backfilled from today's rate or provider tier.
CREATE VIEW booking_financial_terms_legacy_queue AS
SELECT
  b.id AS booking_id,
  b.status,
  b.escrow_status,
  b.customer_id,
  b.provider_id,
  p.tier AS current_provider_tier,
  b.service_price,
  b.service_fee,
  b.total_amount,
  b.payment_method,
  b.payment_intent_id,
  b.created_at,
  b.updated_at
FROM bookings b
LEFT JOIN providers p ON p.id = b.provider_id
LEFT JOIN booking_financial_terms_current ft ON ft.booking_id = b.id
WHERE b.escrow_status IN ('held', 'partially_refunded')
  AND ft.id IS NULL;

COMMENT ON VIEW booking_financial_terms_legacy_queue IS
  'E50 review queue. Do not auto-backfill from current settings or current provider tier.';

-- Migration 166: E55 Option A controlled B2B commercial workflow.
--
-- This migration is deliberately additive. Existing business accounts,
-- contracts, invoices, invoice items, and bookings are retained as legacy
-- evidence. Nothing here guesses historical account ownership, publishes an
-- old contract, or marks an old invoice as controlled.

BEGIN;

-- Original Phase 5 commercial money columns were INTEGER, which caps an
-- account or monthly statement at roughly PHP 21.47 million. Widening to
-- BIGINT is lossless and keeps centavo arithmetic viable for larger accounts.
ALTER TABLE business_accounts
  ALTER COLUMN monthly_credit_limit TYPE BIGINT USING monthly_credit_limit::bigint;

ALTER TABLE business_contracts
  ALTER COLUMN agreed_rate TYPE BIGINT USING agreed_rate::bigint,
  ALTER COLUMN estimated_monthly_value TYPE BIGINT USING estimated_monthly_value::bigint;

ALTER TABLE business_invoices
  ALTER COLUMN subtotal TYPE BIGINT USING subtotal::bigint,
  ALTER COLUMN discount_amount TYPE BIGINT USING discount_amount::bigint,
  ALTER COLUMN tax_amount TYPE BIGINT USING tax_amount::bigint,
  ALTER COLUMN total_amount TYPE BIGINT USING total_amount::bigint;

ALTER TABLE business_invoice_items
  ALTER COLUMN unit_price TYPE BIGINT USING unit_price::bigint,
  ALTER COLUMN discount_amount TYPE BIGINT USING discount_amount::bigint,
  ALTER COLUMN amount TYPE BIGINT USING amount::bigint;

ALTER TABLE business_accounts
  ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1
    CHECK (record_version > 0),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS approval_reason TEXT,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE TABLE business_account_lifecycle_previews (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  business_account_id UUID NOT NULL REFERENCES business_accounts(id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('approve', 'suspend')),
  created_by UUID NOT NULL REFERENCES users(id),
  account_record_version INTEGER NOT NULL CHECK (account_record_version > 0),
  impact_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_fingerprint CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX business_account_lifecycle_previews_operator_lookup
  ON business_account_lifecycle_previews
    (business_account_id, action, created_by, expires_at DESC);

CREATE TABLE business_account_term_versions (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  business_account_id UUID NOT NULL REFERENCES business_accounts(id),
  version INTEGER NOT NULL CHECK (version > 0),
  payment_terms VARCHAR(20) NOT NULL
    CHECK (payment_terms IN ('net_15', 'net_30', 'net_60')),
  volume_discount_basis_points INTEGER NOT NULL
    CHECK (volume_discount_basis_points >= 0 AND volume_discount_basis_points <= 5000),
  monthly_credit_limit BIGINT NOT NULL CHECK (monthly_credit_limit >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  effective_from TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 10),
  created_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_account_id, version),
  UNIQUE (business_account_id, id)
);

CREATE INDEX business_account_term_versions_effective_lookup
  ON business_account_term_versions (business_account_id, effective_from DESC, version DESC);

CREATE TABLE business_account_term_previews (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  business_account_id UUID NOT NULL REFERENCES business_accounts(id),
  created_by UUID NOT NULL REFERENCES users(id),
  account_record_version INTEGER NOT NULL CHECK (account_record_version > 0),
  payment_terms VARCHAR(20) NOT NULL
    CHECK (payment_terms IN ('net_15', 'net_30', 'net_60')),
  volume_discount_basis_points INTEGER NOT NULL
    CHECK (volume_discount_basis_points >= 0 AND volume_discount_basis_points <= 5000),
  monthly_credit_limit BIGINT NOT NULL CHECK (monthly_credit_limit >= 0),
  effective_from TIMESTAMPTZ NOT NULL,
  impact_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_fingerprint CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX business_account_term_previews_operator_lookup
  ON business_account_term_previews (business_account_id, created_by, expires_at DESC);

ALTER TABLE business_contracts
  ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1
    CHECK (record_version > 0),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS publish_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

ALTER TABLE business_contracts
  ADD CONSTRAINT business_contracts_positive_agreed_rate
    CHECK (agreed_rate > 0) NOT VALID,
  ADD CONSTRAINT business_contracts_valid_date_range
    CHECK (end_date IS NULL OR end_date >= start_date) NOT VALID,
  ADD CONSTRAINT business_contracts_published_state_evidence
    CHECK (status <> 'active' OR published_at IS NOT NULL) NOT VALID;

CREATE UNIQUE INDEX business_contracts_account_id_pair
  ON business_contracts (business_account_id, id);

CREATE TABLE business_contract_publication_previews (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  business_account_id UUID NOT NULL REFERENCES business_accounts(id),
  contract_id UUID NOT NULL REFERENCES business_contracts(id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('publish', 'cancel')),
  created_by UUID NOT NULL REFERENCES users(id),
  account_record_version INTEGER NOT NULL CHECK (account_record_version > 0),
  contract_record_version INTEGER NOT NULL CHECK (contract_record_version > 0),
  impact_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_fingerprint CHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX business_contract_previews_operator_lookup
  ON business_contract_publication_previews
    (business_account_id, contract_id, created_by, expires_at DESC);

CREATE TABLE business_contract_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  business_account_id UUID NOT NULL REFERENCES business_accounts(id),
  contract_id UUID NOT NULL REFERENCES business_contracts(id),
  event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('published', 'cancelled')),
  from_status VARCHAR(20) NOT NULL,
  to_status VARCHAR(20) NOT NULL,
  contract_record_version INTEGER NOT NULL CHECK (contract_record_version > 0),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 10),
  actor_id UUID NOT NULL REFERENCES users(id),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX business_contract_events_contract_timeline
  ON business_contract_events (contract_id, created_at DESC);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS business_account_terms_version_id UUID
    REFERENCES business_account_term_versions(id),
  -- Add the discriminator without a default first. PostgreSQL leaves all
  -- pre-migration rows NULL, which is the deliberate legacy-unreviewed state.
  -- Setting the default afterward classifies only new inserts. This avoids
  -- rewriting history and, critically, keeps an older partially-linked booking
  -- updateable while preventing it from entering the controlled B2B path.
  ADD COLUMN IF NOT EXISTS billing_mode VARCHAR(30)
    CHECK (billing_mode IN ('consumer_prepay', 'business_terms'));

ALTER TABLE bookings
  ALTER COLUMN billing_mode SET DEFAULT 'consumer_prepay';

ALTER TABLE bookings
  ADD CONSTRAINT bookings_business_link_complete
    CHECK (
      (billing_mode IS NULL AND business_account_terms_version_id IS NULL)
      OR
      (business_account_id IS NULL AND contract_id IS NULL
        AND business_account_terms_version_id IS NULL AND billing_mode = 'consumer_prepay')
      OR
      (business_account_id IS NOT NULL AND contract_id IS NOT NULL
        AND business_account_terms_version_id IS NOT NULL AND billing_mode = 'business_terms')
    ) NOT VALID,
  ADD CONSTRAINT bookings_contract_belongs_to_business
    FOREIGN KEY (business_account_id, contract_id)
    REFERENCES business_contracts (business_account_id, id) NOT VALID,
  ADD CONSTRAINT bookings_terms_belong_to_business
    FOREIGN KEY (business_account_id, business_account_terms_version_id)
    REFERENCES business_account_term_versions (business_account_id, id) NOT VALID;

CREATE INDEX bookings_business_terms_version_lookup
  ON bookings (business_account_terms_version_id)
  WHERE business_account_terms_version_id IS NOT NULL;

ALTER TABLE business_invoices
  ADD COLUMN IF NOT EXISTS record_version INTEGER NOT NULL DEFAULT 1
    CHECK (record_version > 0),
  ADD COLUMN IF NOT EXISTS control_state VARCHAR(30) NOT NULL DEFAULT 'legacy_unreviewed'
    CHECK (control_state IN ('legacy_unreviewed', 'controlled')),
  ADD COLUMN IF NOT EXISTS settlement_state VARCHAR(30) NOT NULL DEFAULT 'legacy_unreviewed'
    CHECK (settlement_state IN ('legacy_unreviewed', 'open', 'settled', 'credit_due', 'void')),
  ADD COLUMN IF NOT EXISTS document_kind VARCHAR(30) NOT NULL DEFAULT 'commercial_statement'
    CHECK (document_kind = 'commercial_statement'),
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'PHP'
    CHECK (currency = 'PHP'),
  ADD COLUMN IF NOT EXISTS account_terms_version_id UUID
    REFERENCES business_account_term_versions(id),
  ADD COLUMN IF NOT EXISTS manifest_hash CHAR(64),
  ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prepared_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS preparation_reason TEXT,
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS finalization_reason TEXT;

CREATE UNIQUE INDEX business_invoices_controlled_period_terms_unique
  ON business_invoices (
    business_account_id, billing_period_start, billing_period_end, account_terms_version_id
  )
  WHERE control_state = 'controlled' AND status NOT IN ('cancelled', 'void');

ALTER TABLE business_invoices
  ADD CONSTRAINT business_invoices_controlled_terms_required
    CHECK (control_state <> 'controlled' OR account_terms_version_id IS NOT NULL) NOT VALID,
  ADD CONSTRAINT business_invoices_controlled_settlement_state
    CHECK (control_state <> 'controlled' OR settlement_state <> 'legacy_unreviewed') NOT VALID,
  ADD CONSTRAINT business_invoices_terms_belong_to_business
    FOREIGN KEY (business_account_id, account_terms_version_id)
    REFERENCES business_account_term_versions (business_account_id, id) NOT VALID;

CREATE TABLE business_invoice_previews (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  business_account_id UUID NOT NULL REFERENCES business_accounts(id),
  created_by UUID NOT NULL REFERENCES users(id),
  account_record_version INTEGER NOT NULL CHECK (account_record_version > 0),
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  candidate_fingerprint CHAR(64) NOT NULL,
  candidate_summary JSONB NOT NULL,
  exception_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (billing_period_end >= billing_period_start)
);

CREATE INDEX business_invoice_previews_operator_lookup
  ON business_invoice_previews (business_account_id, created_by, expires_at DESC);

-- Every draft prepared from one preview carries the same batch identifier.
-- Finalization can then ignore sibling drafts from that exact preview while
-- still treating statements from any other preparation as booking claims.
ALTER TABLE business_invoices
  ADD COLUMN IF NOT EXISTS preparation_preview_id UUID
    REFERENCES business_invoice_previews(id);

CREATE INDEX business_invoices_preparation_preview_lookup
  ON business_invoices (preparation_preview_id)
  WHERE preparation_preview_id IS NOT NULL;

ALTER TABLE business_invoice_items
  ADD COLUMN IF NOT EXISTS account_terms_version_id UUID
    REFERENCES business_account_term_versions(id),
  ADD COLUMN IF NOT EXISTS booking_financial_terms_id UUID
    REFERENCES booking_financial_terms(id),
  ADD COLUMN IF NOT EXISTS source_booking_total BIGINT
    CHECK (source_booking_total IS NULL OR source_booking_total >= 0),
  ADD COLUMN IF NOT EXISTS service_price_amount BIGINT
    CHECK (service_price_amount IS NULL OR service_price_amount >= 0),
  ADD COLUMN IF NOT EXISTS service_fee_amount BIGINT
    CHECK (service_fee_amount IS NULL OR service_fee_amount >= 0),
  ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'PHP'
    CHECK (currency = 'PHP'),
  ADD COLUMN IF NOT EXISTS manifest_position INTEGER
    CHECK (manifest_position IS NULL OR manifest_position > 0);

CREATE TABLE business_invoice_adjustments (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  invoice_id UUID NOT NULL REFERENCES business_invoices(id),
  adjustment_type VARCHAR(20) NOT NULL
    CHECK (adjustment_type IN ('credit', 'debit', 'write_off')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 10),
  evidence_reference TEXT NOT NULL CHECK (char_length(trim(evidence_reference)) >= 3),
  recorded_by UUID NOT NULL REFERENCES users(id),
  invoice_record_version INTEGER NOT NULL CHECK (invoice_record_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX business_invoice_adjustments_invoice_timeline
  ON business_invoice_adjustments (invoice_id, created_at ASC);

CREATE TABLE business_invoice_payments (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  invoice_id UUID NOT NULL REFERENCES business_invoices(id),
  entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('payment', 'reversal')),
  reverses_payment_id UUID REFERENCES business_invoice_payments(id),
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'PHP' CHECK (currency = 'PHP'),
  method VARCHAR(30) NOT NULL
    CHECK (method IN ('bank_transfer', 'cash_deposit', 'check', 'other_external')),
  effective_at TIMESTAMPTZ NOT NULL,
  external_reference TEXT NOT NULL CHECK (char_length(trim(external_reference)) >= 3),
  evidence_reference TEXT NOT NULL CHECK (char_length(trim(evidence_reference)) >= 3),
  evidence_object_key TEXT,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 10),
  recorded_by UUID NOT NULL REFERENCES users(id),
  invoice_record_version INTEGER NOT NULL CHECK (invoice_record_version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (entry_type = 'payment' AND reverses_payment_id IS NULL)
    OR (entry_type = 'reversal' AND reverses_payment_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX business_invoice_payments_reference_unique
  ON business_invoice_payments (method, lower(external_reference));

CREATE INDEX business_invoice_payments_invoice_timeline
  ON business_invoice_payments (invoice_id, created_at ASC);

CREATE UNIQUE INDEX business_invoice_payments_invoice_id_pair
  ON business_invoice_payments (invoice_id, id);

ALTER TABLE business_invoice_payments
  ADD CONSTRAINT business_invoice_payment_reversal_same_invoice
    FOREIGN KEY (invoice_id, reverses_payment_id)
    REFERENCES business_invoice_payments (invoice_id, id);

-- The controlled data model can be tested without exposing an unfinished
-- provider-settlement path to customers. This launch gate stays read-only in
-- Settings until settlement funding, cancellation, disputes, and production
-- history have been reconciled end to end.
INSERT INTO platform_settings
  (category, subcategory, key, label, description, value_type,
   value, default_value, display_order, is_active)
VALUES (
  'feature_flags', 'launch_phase',
  'feature_flag.business_contract_booking_enabled',
  'Business Contract Booking Enabled',
  'E55 controlled launch gate held by E56. Keep disabled until provider funding, settlement, cancellation, disputes, and production-history reconciliation are approved and verified.',
  'boolean', 'false', 'false', 102, TRUE
)
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  subcategory = EXCLUDED.subcategory,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  value_type = EXCLUDED.value_type,
  value = 'false',
  default_value = EXCLUDED.default_value,
  display_order = EXCLUDED.display_order,
  is_active = TRUE;

CREATE OR REPLACE FUNCTION reject_immutable_business_financial_record_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable; append corrective evidence instead', TG_TABLE_NAME
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER business_account_term_versions_immutable
BEFORE UPDATE OR DELETE ON business_account_term_versions
FOR EACH ROW EXECUTE FUNCTION reject_immutable_business_financial_record_mutation();

CREATE TRIGGER business_contract_events_immutable
BEFORE UPDATE OR DELETE ON business_contract_events
FOR EACH ROW EXECUTE FUNCTION reject_immutable_business_financial_record_mutation();

CREATE TRIGGER business_invoice_items_immutable
BEFORE UPDATE OR DELETE ON business_invoice_items
FOR EACH ROW EXECUTE FUNCTION reject_immutable_business_financial_record_mutation();

CREATE TRIGGER business_invoice_adjustments_immutable
BEFORE UPDATE OR DELETE ON business_invoice_adjustments
FOR EACH ROW EXECUTE FUNCTION reject_immutable_business_financial_record_mutation();

CREATE TRIGGER business_invoice_payments_immutable
BEFORE UPDATE OR DELETE ON business_invoice_payments
FOR EACH ROW EXECUTE FUNCTION reject_immutable_business_financial_record_mutation();

-- Add specific audit verbs without dropping verbs introduced by earlier
-- migrations. This follows the same constraint-preserving pattern as 162.
DO $migration_166_action$
DECLARE
  current_def TEXT;
  appendage TEXT;
  missing_verbs TEXT[] := ARRAY[
    'business_account_approved',
    'business_account_suspended',
    'business_terms_published',
    'business_contract_published',
    'business_contract_cancelled',
    'business_invoice_draft_prepared',
    'business_invoice_finalized',
    'business_invoice_adjustment_recorded',
    'business_invoice_payment_recorded',
    'business_invoice_payment_reversed',
    'business_invoice_voided'
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

  IF appendage IS NOT NULL THEN
    ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
    EXECUTE format(
      'ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check %s',
      regexp_replace(current_def, '\]\)\)\)$', ', ' || appendage || '])))')
    );
  END IF;
END
$migration_166_action$;

COMMIT;

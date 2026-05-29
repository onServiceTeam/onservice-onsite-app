-- Phase 200 — link a booking to the B2B account + contract it was priced under.
--
-- Pre-Phase-200 a booking had no link to a business account or contract; a
-- booking was only "B2B" because its customer happened to be a member, and it
-- always used the standard catalog price. These nullable columns let a
-- booking be explicitly placed under a business account + contract so it can
-- be priced at the contract's agreed_rate and audited/reconciled later.
--
-- Both are NULL for every normal consumer booking (the default), so existing
-- behavior is unchanged. See .ai-coder/decisions/D-phase200-contract-pricing.md.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS business_account_id UUID REFERENCES business_accounts(id),
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES business_contracts(id);

CREATE INDEX IF NOT EXISTS idx_bookings_business_account
  ON bookings(business_account_id) WHERE business_account_id IS NOT NULL;

import { readFileSync } from 'fs';
import { resolve } from 'path';

const sql = readFileSync(resolve(__dirname, '../../migrations/166_b2b_controlled_billing.sql'), 'utf8');

it('Bug OPS-331 — migration 166 adds controlled evidence without reclassifying or rewriting legacy rows', () => {
  expect(sql).toContain("DEFAULT 'legacy_unreviewed'");
  expect(sql).not.toMatch(/UPDATE\s+business_(?:invoices|invoice_items|contracts)/i);
  expect(sql).not.toMatch(/UPDATE\s+bookings/i);
  expect(sql).toContain('business_account_term_versions');
  expect(sql).toContain('business_invoice_previews');
  expect(sql).toContain('business_invoice_payments');
  expect(sql).toContain('business_invoice_adjustments');
  expect(sql).toContain('business_invoice_items_immutable');
  expect(sql).toContain('bookings_business_link_complete');
  expect(sql).toContain('(billing_mode IS NULL AND business_account_terms_version_id IS NULL)');
  expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS billing_mode VARCHAR\(30\)[\s\S]*ALTER COLUMN billing_mode SET DEFAULT 'consumer_prepay'/);
  expect(sql).toContain('preparation_preview_id');
  expect(sql).toContain('business_invoice_payment_reversal_same_invoice');
  expect(sql).toContain('business_invoices_terms_belong_to_business');
  expect(sql).toContain("settlement_state IN ('legacy_unreviewed', 'open', 'settled', 'credit_due', 'void')");
  expect(sql).toContain('ALTER COLUMN monthly_credit_limit TYPE BIGINT');
  expect(sql).toContain('ALTER COLUMN total_amount TYPE BIGINT');
  expect(sql).toContain('feature_flag.business_contract_booking_enabled');
  expect(sql).toMatch(/ON CONFLICT \(key\) DO UPDATE SET[\s\S]*value = 'false'/);
});

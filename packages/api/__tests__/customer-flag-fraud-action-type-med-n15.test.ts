// MED-N15 fix verified — customer flag_fraud action now records
// with the correct action_type 'customer_flagged_fraud' AND sets
// users.is_flagged_fraud=TRUE so the flag is queryable directly.
//
// Pre-fix: action wrote action_type='customer_suspended' with a
// '[fraud_flag] ' reason prefix because 'flag_fraud' wasn't in the
// CHECK constraint. Analytics couldn't tell flags from suspensions
// without parsing reason strings; suspension count was inflated.
//
// Post-fix:
// 1. New migration 096 adds 'customer_flagged_fraud' to the
//    action_type CHECK constraint AND adds users.is_flagged_fraud
//    BOOLEAN.
// 2. customer-admin.service writes the correct action_type and
//    flips the boolean inside the same transaction.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/customer-admin.service.ts'),
  'utf8',
);
const MIGRATION = readFileSync(
  resolve(__dirname, '../migrations/096_customer_flagged_fraud.sql'),
  'utf8',
);

describe('MED-N15 — customer flag_fraud uses correct action_type', () => {
  it('flag_fraud branch sets actionType = customer_flagged_fraud (NOT customer_suspended)', () => {
    const block = SVC.match(/MED-N15 fix[\s\S]{0,500}actionType = 'customer_flagged_fraud'/);
    expect(block).not.toBeNull();
  });

  it('does NOT add the [fraud_flag] reason prefix any more', () => {
    expect(SVC).not.toMatch(/\[fraud_flag\] /);
    expect(SVC).not.toMatch(/detailsPrefix \+ trimmed/);
  });

  it('flag_fraud sets users.is_flagged_fraud = TRUE inside the same transaction', () => {
    expect(SVC).toMatch(/UPDATE users SET is_flagged_fraud = TRUE/);
    // The UPDATE is gated on action === 'flag_fraud'.
    expect(SVC).toMatch(/if \(action === 'flag_fraud'\) \{[\s\S]{0,300}is_flagged_fraud = TRUE/);
  });

  it('flag_fraud still does NOT change users.is_active', () => {
    // The is_active UPDATE is gated to skip flag_fraud.
    expect(SVC).toMatch(/if \(action !== 'flag_fraud' && newIsActive !== user\.is_active\)/);
  });
});

describe('MED-N15 — migration 096 adds the new action_type + column', () => {
  it("'customer_flagged_fraud' is in the new CHECK constraint", () => {
    expect(MIGRATION).toMatch(/'customer_flagged_fraud'/);
  });

  it('drops + re-adds the constraint (no orphan version)', () => {
    expect(MIGRATION).toMatch(/DROP CONSTRAINT IF EXISTS admin_actions_action_type_check/);
    expect(MIGRATION).toMatch(/ADD CONSTRAINT admin_actions_action_type_check/);
  });

  it('adds users.is_flagged_fraud BOOLEAN with default FALSE', () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS is_flagged_fraud BOOLEAN NOT NULL DEFAULT FALSE/);
  });

  it('partial index for fast "list flagged customers" admin query', () => {
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS idx_users_flagged_fraud[\s\S]*?WHERE is_flagged_fraud = TRUE/);
  });

  it('preserves existing action_type values (regression guard for a key sample)', () => {
    for (const t of [
      'provider_approved', 'customer_suspended', 'booking_force_completed',
      'dispute_resolved', 'manual_escrow_release', 'admin_2fa_enrolled',
    ]) {
      expect(MIGRATION).toMatch(new RegExp(`'${t}'`));
    }
  });
});

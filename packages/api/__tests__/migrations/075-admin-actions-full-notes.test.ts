// Phase 14 Dispatch 06 — migration 075 smoke test.
// Bug 85 + all D06 audit verbs.
//
// Static-analysis test: reads the migration file and asserts the
// expected SQL is present. Runtime CHECK-constraint behavior is
// covered by integration tests in subsequent dispatches that hit a
// real Postgres instance.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../migrations/075_d06_admin_actions_full_notes_and_verbs.sql',
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf8');
});

describe('Bug 85 — migration 075 admin_actions.full_notes column', () => {
  it('adds full_notes TEXT column to admin_actions', () => {
    expect(sql).toMatch(/ALTER TABLE admin_actions\s+ADD COLUMN IF NOT EXISTS full_notes TEXT/);
  });

  it('adds the column as nullable (no NOT NULL)', () => {
    // The ADD COLUMN line should not include NOT NULL — backward compat
    // with pre-D06 audit rows that have no full_notes captured.
    const addCol = /ADD COLUMN IF NOT EXISTS full_notes TEXT[^;]*/.exec(sql);
    expect(addCol).not.toBeNull();
    expect(addCol![0]).not.toMatch(/NOT NULL/);
  });
});

describe('D06 audit verbs — migration 075 action_type extension', () => {
  it('extends action_type with provider_note_added (Bug 82)', () => {
    expect(sql).toMatch(/'provider_note_added'/);
  });

  it('extends action_type with provider_note_deleted (Bug 80)', () => {
    expect(sql).toMatch(/'provider_note_deleted'/);
  });

  it('extends action_type with provider_profile_updated (Bug 79)', () => {
    expect(sql).toMatch(/'provider_profile_updated'/);
  });

  it('extends action_type with provider_wallet_adjusted (Bug 78)', () => {
    expect(sql).toMatch(/'provider_wallet_adjusted'/);
  });

  it('extends action_type with business_member_removed (Bug 105)', () => {
    expect(sql).toMatch(/'business_member_removed'/);
  });

  it('extends action_type with business_ownership_transferred (Bug 106)', () => {
    expect(sql).toMatch(/'business_ownership_transferred'/);
  });

  it('extends action_type with admin_role_archived (Bug 127)', () => {
    expect(sql).toMatch(/'admin_role_archived'/);
  });

  it('extends action_type with all four service_category/subcategory verbs (Bug 237)', () => {
    expect(sql).toMatch(/'service_category_created'/);
    expect(sql).toMatch(/'service_category_updated'/);
    expect(sql).toMatch(/'service_subcategory_created'/);
    expect(sql).toMatch(/'service_subcategory_updated'/);
  });

  it('extends action_type with all three service_addon verbs (Bug 237)', () => {
    expect(sql).toMatch(/'service_addon_created'/);
    expect(sql).toMatch(/'service_addon_updated'/);
    expect(sql).toMatch(/'service_addon_deleted'/);
  });

  it('preserves pre-existing verbs (manual_escrow_release etc.)', () => {
    expect(sql).toMatch(/'manual_escrow_release'/);
    expect(sql).toMatch(/'dispute_resolved'/);
    expect(sql).toMatch(/'admin_message_sent'/);
  });

  it('drops and re-adds the action_type constraint (atomic update)', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS admin_actions_action_type_check/);
    expect(sql).toMatch(/ADD CONSTRAINT admin_actions_action_type_check/);
  });
});

describe('D06 audit target types — migration 075 target_type extension', () => {
  it('extends target_type with business (Bugs 105/106)', () => {
    expect(sql).toMatch(/'business'/);
  });

  it('extends target_type with admin_role (Bug 127)', () => {
    expect(sql).toMatch(/'admin_role'/);
  });

  it('extends target_type with service_category/subcategory/addon (Bug 237)', () => {
    expect(sql).toMatch(/'service_category'/);
    expect(sql).toMatch(/'service_subcategory'/);
    expect(sql).toMatch(/'service_addon'/);
  });

  it('extends target_type with provider_note (Bugs 80/82)', () => {
    expect(sql).toMatch(/'provider_note'/);
  });

  it('preserves pre-existing target types', () => {
    expect(sql).toMatch(/'booking'/);
    expect(sql).toMatch(/'dispute'/);
    expect(sql).toMatch(/'message'/);
  });
});

describe('migration 075 — composite index for admin audit listing', () => {
  it('creates idx_admin_actions_admin_created on (admin_id, created_at DESC)', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_created\s+ON admin_actions\(admin_id, created_at DESC\)/,
    );
  });
});

describe('migration 075 — file presence and structure', () => {
  it('file exists and is non-empty', () => {
    expect(sql.length).toBeGreaterThan(100);
  });

  it('references the correct dispatch in comments', () => {
    expect(sql).toMatch(/Phase 14 Dispatch 06/i);
  });

  it('runs in a transaction (BEGIN..COMMIT)', () => {
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/^COMMIT;/m);
  });
});

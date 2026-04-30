// Phase 14 Dispatch 06 — migration 076 smoke test.
// Bugs 80, 105, 127 — soft-delete columns enable atomic delete + audit.
//
// Static-analysis: reads the migration SQL and asserts each affected
// table gets the three soft-delete columns + the partial active index.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION_PATH = resolve(
  __dirname,
  '../../migrations/076_d06_soft_delete_columns.sql',
);

let sql: string;

beforeAll(() => {
  sql = readFileSync(MIGRATION_PATH, 'utf8');
});

describe('Bug 80 + 82 — provider_admin_notes soft-delete', () => {
  it('adds deleted_at TIMESTAMPTZ to provider_admin_notes', () => {
    expect(sql).toMatch(
      /ALTER TABLE provider_admin_notes[\s\S]*?ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ/,
    );
  });

  it('adds deleted_by UUID FK to users(id) on provider_admin_notes', () => {
    expect(sql).toMatch(
      /ALTER TABLE provider_admin_notes[\s\S]*?ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users\(id\) ON DELETE SET NULL/,
    );
  });

  it('adds deleted_reason TEXT to provider_admin_notes', () => {
    expect(sql).toMatch(
      /ALTER TABLE provider_admin_notes[\s\S]*?ADD COLUMN IF NOT EXISTS deleted_reason TEXT/,
    );
  });

  it('creates partial active index on provider_admin_notes WHERE deleted_at IS NULL', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_provider_admin_notes_active[\s\S]*?WHERE deleted_at IS NULL/,
    );
  });
});

describe('Bug 105 — business_members soft-delete', () => {
  it('adds deleted_at TIMESTAMPTZ to business_members', () => {
    expect(sql).toMatch(
      /ALTER TABLE business_members[\s\S]*?ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ/,
    );
  });

  it('adds deleted_by UUID FK to users(id) on business_members', () => {
    expect(sql).toMatch(
      /ALTER TABLE business_members[\s\S]*?ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users\(id\) ON DELETE SET NULL/,
    );
  });

  it('adds deleted_reason TEXT to business_members', () => {
    expect(sql).toMatch(
      /ALTER TABLE business_members[\s\S]*?ADD COLUMN IF NOT EXISTS deleted_reason TEXT/,
    );
  });

  it('creates partial active index on business_members WHERE deleted_at IS NULL', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_business_members_active[\s\S]*?WHERE deleted_at IS NULL/,
    );
  });
});

describe('Bug 127 — admin_roles soft-delete', () => {
  it('adds deleted_at TIMESTAMPTZ to admin_roles', () => {
    expect(sql).toMatch(
      /ALTER TABLE admin_roles[\s\S]*?ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ/,
    );
  });

  it('adds deleted_by UUID FK to users(id) on admin_roles', () => {
    expect(sql).toMatch(
      /ALTER TABLE admin_roles[\s\S]*?ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users\(id\) ON DELETE SET NULL/,
    );
  });

  it('adds deleted_reason TEXT to admin_roles', () => {
    expect(sql).toMatch(
      /ALTER TABLE admin_roles[\s\S]*?ADD COLUMN IF NOT EXISTS deleted_reason TEXT/,
    );
  });

  it('creates partial active index on admin_roles WHERE deleted_at IS NULL', () => {
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS idx_admin_roles_active[\s\S]*?WHERE deleted_at IS NULL/,
    );
  });
});

describe('migration 076 — file presence and structure', () => {
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

  it('uses ON DELETE SET NULL for deleted_by (so user purges do not cascade-destroy audit)', () => {
    const setNullCount = (sql.match(/ON DELETE SET NULL/g) || []).length;
    expect(setNullCount).toBeGreaterThanOrEqual(3);
  });
});

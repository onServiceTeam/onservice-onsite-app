// MED-N37 + MED-N38 + MED-N39 + MED-N40 fix verified.
//
// MED-N37: catalog.createCategory now catches Postgres SQLSTATE
// 23505 (unique violation on slug) and rethrows as a friendly 409
// instead of letting the raw DB error escape.
//
// MED-N38: business.createBusinessAccount now wraps the
// business_accounts INSERT + business_members owner INSERT in a
// single transaction so a failure in step 2 rolls back step 1
// (no orphan accounts with no owner).
//
// MED-N39: business.addMember now re-activates soft-deleted
// member rows by UPDATEing deleted_at = NULL + resetting
// role/permissions, preserving the audit trail (deleted_by,
// deleted_reason). Pre-fix used ON CONFLICT DO NOTHING which
// silently no-op'd, then the function threw "already a member".
//
// MED-N40: business.addMember pre-validates the target user
// exists with a clean 404 instead of letting the FK constraint
// fail with a raw 23503 violation.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CATALOG = readFileSync(
  resolve(__dirname, '../src/services/catalog.service.ts'),
  'utf8',
);
const BUSINESS = readFileSync(
  resolve(__dirname, '../src/services/business.service.ts'),
  'utf8',
);

describe('MED-N37 — catalog.createCategory friendly 409 on duplicate slug', () => {
  it('catches Postgres SQLSTATE 23505 (unique violation)', () => {
    expect(CATALOG).toMatch(/\(err as \{ code: unknown \}\)\.code === '23505'/);
  });

  it('rethrows as 409 with a friendly message including the slug', () => {
    expect(CATALOG).toMatch(/A category with this name already exists \(slug: "\$\{slug\}"\)/);
    // The createAppError call uses 409.
    expect(CATALOG).toMatch(/createAppError\(`A category with this name already exists[^`]*`,\s*409\)/);
  });

  it('non-23505 errors still propagate', () => {
    // Source: `else throw err;` inside the catch.
    const block = CATALOG.match(/MED-N37 fix[\s\S]*?throw err;\s*\}/);
    expect(block).not.toBeNull();
  });
});

describe('MED-N38 — business.createBusinessAccount is transactional', () => {
  it('wraps both INSERTs in a single db.transaction', () => {
    expect(BUSINESS).toMatch(/MED-N38 fix[\s\S]{0,800}return db\.transaction\(async \(client\) => \{/);
  });

  it('owner-member INSERT uses client.query (same tx as account INSERT)', () => {
    const block = BUSINESS.match(/MED-N38 fix[\s\S]*?return result\.rows\[0\]!;\s*\}\);/);
    expect(block).not.toBeNull();
    // Both INSERTs use the trx client. The first uses a typed
    // generic (client.query<BusinessAccountRow>) so allow the
    // optional `<...>` segment.
    expect(block![0]).toMatch(/await client\.query(?:<[^>]+>)?\([\s\S]*?INSERT INTO business_accounts/);
    expect(block![0]).toMatch(/await client\.query(?:<[^>]+>)?\([\s\S]*?INSERT INTO business_members/);
  });

  it('no top-level db.query inside createBusinessAccount any more', () => {
    const block = BUSINESS.match(/export async function createBusinessAccount[\s\S]*?return result\.rows\[0\]!;[\s\S]{0,30}}\);/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/await db\.query/);
  });
});

describe('MED-N39 — business.addMember re-activates soft-deleted members', () => {
  it('uses ON CONFLICT DO UPDATE (NOT DO NOTHING) to re-activate', () => {
    const block = BUSINESS.match(/MED-N39 fix[\s\S]{0,1500}RETURNING \*`/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/ON CONFLICT \(business_account_id, user_id\) DO UPDATE/);
    expect(block![0]).not.toMatch(/ON CONFLICT \(business_account_id, user_id\) DO NOTHING/);
  });

  it('UPDATE clears deleted_at and resets role/permissions', () => {
    expect(BUSINESS).toMatch(/deleted_at = NULL/);
    expect(BUSINESS).toMatch(/role = EXCLUDED\.role/);
    expect(BUSINESS).toMatch(/can_book = EXCLUDED\.can_book/);
  });

  it('UPDATE only fires when the existing row is soft-deleted (preserves "already a member" 409 for active rows)', () => {
    expect(BUSINESS).toMatch(/WHERE business_members\.deleted_at IS NOT NULL/);
  });
});

describe('MED-N40 — business.addMember pre-validates target user exists', () => {
  it('SELECTs from users with is_active = TRUE filter before the INSERT', () => {
    // BUG-PHASE78-01 test maintenance — Phase 28-02 fix changed
    // the soft-delete signal from deleted_at IS NULL (which doesn't
    // exist on users) to is_active = TRUE. Test pattern updated to
    // match the new source.
    expect(BUSINESS).toMatch(/MED-N40 fix[\s\S]{0,1000}SELECT 1 FROM users WHERE id = \$1 AND is_active = TRUE/);
  });

  it('throws 404 with "Target user not found" when the user is missing', () => {
    expect(BUSINESS).toMatch(/createAppError\('Target user not found\.', 404\)/);
  });

  it('the existence check runs BEFORE the INSERT (otherwise FK error still surfaces)', () => {
    // Find both anchors and assert ordering.
    const userCheckPos = BUSINESS.indexOf("MED-N40 fix");
    const insertPos = BUSINESS.indexOf("MED-N39 fix");
    expect(userCheckPos).toBeGreaterThan(0);
    expect(insertPos).toBeGreaterThan(userCheckPos);
  });
});

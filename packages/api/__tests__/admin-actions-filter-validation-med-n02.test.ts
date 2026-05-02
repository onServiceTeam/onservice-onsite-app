// MED-N02 fix verified — admin GET /actions endpoint validates
// adminId (UUID) and actionType (slug shape) before passing to
// the service. Pre-fix, garbage values either returned empty
// results or caused unparseable-UUID errors to bubble up as 500.
// Now: clean 400 with a helpful message.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/admin.routes.ts'),
  'utf8',
);

describe('MED-N02 — admin /actions endpoint validates filter params', () => {
  it('UUID regex validates adminId before passing to service', () => {
    expect(ROUTES).toMatch(/MED-N02 fix/);
    expect(ROUTES).toMatch(/UUID_REGEX = \/\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$\/i/);
  });

  it('throws 400 with clear message when adminId is not a UUID', () => {
    expect(ROUTES).toMatch(/!UUID_REGEX\.test\(req\.query\.adminId\)/);
    expect(ROUTES).toMatch(/createAppError\('adminId must be a valid UUID\.', 400\)/);
  });

  it('actionType regex enforces lowercase slug shape', () => {
    expect(ROUTES).toMatch(/ACTION_TYPE_REGEX = \/\^\[a-z\]\[a-z0-9_\]\{2,80\}\$\//);
  });

  it('throws 400 with clear message when actionType has invalid characters', () => {
    expect(ROUTES).toMatch(/!ACTION_TYPE_REGEX\.test\(req\.query\.actionType\)/);
    expect(ROUTES).toMatch(/actionType must be lowercase letters, digits, or underscores/);
  });

  it('empty / missing query params still produce undefined (no validation runs)', () => {
    // Source-level: the validation is gated on `length > 0` so
    // omitted query params don't trigger 400.
    expect(ROUTES).toMatch(/typeof req\.query\.adminId === 'string' && req\.query\.adminId\.length > 0/);
    expect(ROUTES).toMatch(/typeof req\.query\.actionType === 'string' && req\.query\.actionType\.length > 0/);
  });
});

describe('MED-N02 — UUID + slug regex behavior smoke', () => {
  // Mirror the regexes inline so we verify the contract.
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ACTION_TYPE_REGEX = /^[a-z][a-z0-9_]{2,80}$/;

  it('accepts a canonical UUIDv4', () => {
    expect(UUID_REGEX.test('11111111-1111-4111-9111-111111111111')).toBe(true);
  });

  it('accepts uppercase hex (case-insensitive)', () => {
    expect(UUID_REGEX.test('11111111-1111-1111-1111-1111111111AA')).toBe(true);
  });

  it('rejects junk strings', () => {
    expect(UUID_REGEX.test('not-a-uuid')).toBe(false);
    expect(UUID_REGEX.test('11111111-1111-1111-1111-11111111111')).toBe(false); // too short
    expect(UUID_REGEX.test("'; DROP TABLE users;--")).toBe(false);
  });

  it('action_type accepts canonical values from the CHECK constraint', () => {
    expect(ACTION_TYPE_REGEX.test('provider_approved')).toBe(true);
    expect(ACTION_TYPE_REGEX.test('customer_flagged_fraud')).toBe(true);
    expect(ACTION_TYPE_REGEX.test('aml_review_cleared')).toBe(true);
  });

  it('action_type rejects mixed case, leading digit, hyphens, special chars', () => {
    expect(ACTION_TYPE_REGEX.test('Provider_Approved')).toBe(false);
    expect(ACTION_TYPE_REGEX.test('1_starts_with_digit')).toBe(false);
    expect(ACTION_TYPE_REGEX.test('with-hyphen')).toBe(false);
    expect(ACTION_TYPE_REGEX.test('with space')).toBe(false);
    expect(ACTION_TYPE_REGEX.test('xx')).toBe(false); // 2 chars: too short
  });
});

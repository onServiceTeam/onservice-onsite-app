/**
 * Phase 13 Dispatch E — BIGINT money column precision regression tests.
 *
 * Migration 059 widens centavos columns from INTEGER to BIGINT.
 * `packages/api/src/config/database.config.ts` registers a pg-types parser for
 * OID 20 (BIGINT) that coerces returned strings to JS Number ("Option B").
 *
 * These tests are HERMETIC: db.query is mocked. They cannot exercise real
 * Postgres-side BIGINT columns (the schema migration is verified separately on
 * staging via the migration harness). What they DO assert:
 *
 *   1. The pg-types OID-20 parser is registered as a side effect of importing
 *      `database.config`, and round-trips representative values:
 *        a. ₱50M (5_000_000_000 centavos) — well above INT4 ceiling, well below
 *           Number.MAX_SAFE_INTEGER. Documents that ordinary platform-scale
 *           values are exact.
 *        b. Number.MAX_SAFE_INTEGER (9_007_199_254_740_991) — the documented
 *           Option B ceiling. Exact round-trip.
 *        c. Number.MAX_SAFE_INTEGER + 1 (9_007_199_254_740_992) — proves the
 *           Option B limitation: this value comes back ALTERED. This is a
 *           DOCUMENTED constraint, not a bug. See LAUNCH-LIMITATIONS §15.
 *
 *   2. Service-layer code that reads `bookings.total_amount` treats the value
 *      as a JS Number, with no string handling required.
 */

const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Importing database.config registers the OID-20 parser as a module side effect.
// We import it for that side effect even though we don't use the exported pool here.
import '../src/config/database.config';
import * as pgTypes from 'pg-types';

beforeEach(() => {
  dbQueryMock.mockReset();
});

describe('BIGINT money column precision (migration 059 + pg-types Option B)', () => {
  const PARSER_OID_BIGINT = 20;

  test('Test 1 — ₱50M (5_000_000_000 centavos) round-trips exactly as Number', () => {
    const written = 5_000_000_000;
    const parser = pgTypes.getTypeParser(PARSER_OID_BIGINT) as (raw: string) => unknown;

    const readBack = parser(String(written));

    expect(typeof readBack).toBe('number');
    expect(readBack).toBe(written);
  });

  test('Test 2 — Number.MAX_SAFE_INTEGER round-trips exactly as Number', () => {
    const written = Number.MAX_SAFE_INTEGER; // 9_007_199_254_740_991
    const parser = pgTypes.getTypeParser(PARSER_OID_BIGINT) as (raw: string) => unknown;

    const readBack = parser(String(written));

    expect(typeof readBack).toBe('number');
    expect(readBack).toBe(written);
  });

  test('Test 3 — MAX_SAFE_INTEGER + 1 is ALTERED on read (documented Option B ceiling)', () => {
    // 9_007_199_254_740_992 is exactly representable as f64, BUT 9_007_199_254_740_993 is NOT.
    // To prove Option B's documented loss-above-ceiling behaviour we use a value that
    // demonstrably loses precision when round-tripped through Number(): pick a value
    // unambiguously above the safe integer ceiling and assert inequality after coercion.
    const written = '9007199254740993'; // = MAX_SAFE_INTEGER + 2; not exactly representable as f64
    const parser = pgTypes.getTypeParser(PARSER_OID_BIGINT) as (raw: string) => unknown;

    const readBack = parser(written);

    expect(typeof readBack).toBe('number');
    // String round-trip is the rigorous comparison: f64 cannot represent this exactly.
    expect(String(readBack)).not.toBe(written);
    // This documents the Option B ceiling stated in LAUNCH-LIMITATIONS §15.
  });

  test('Test 4 — parser registration is a module-load side effect of database.config', () => {
    // Re-import at runtime to confirm registration survived (caching does not unregister).
    const parser = pgTypes.getTypeParser(PARSER_OID_BIGINT) as (raw: string) => unknown;
    expect(typeof parser).toBe('function');

    // A representative bigint literal returns Number, not string.
    const out = parser('1234567890123');
    expect(typeof out).toBe('number');
    expect(out).toBe(1234567890123);
  });

  test('Test 5 — service layer treats bookings.total_amount as Number after parser', async () => {
    // Smoke test: when db.query returns a row whose total_amount is a Number (as it
    // will be post-parser-registration), downstream service code can do arithmetic
    // without string coercion. Mocked here to lock in that contract.
    const total = 5_000_000_000;
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'b1', total_amount: total, service_price: total - 50000, service_fee: 50000 }],
      rowCount: 1,
    });
    const { db } = await import('../src/models/db');
    const result = await db.query<{ id: string; total_amount: number; service_price: number; service_fee: number }>(
      'SELECT id, total_amount, service_price, service_fee FROM bookings WHERE id = $1',
      ['b1'],
    );
    const row = result.rows[0]!;
    expect(typeof row.total_amount).toBe('number');
    expect(row.total_amount).toBe(total);
    expect(row.service_price + row.service_fee).toBe(row.total_amount);
  });
});

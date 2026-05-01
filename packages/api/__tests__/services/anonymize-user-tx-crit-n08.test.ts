// CRIT-N08 fix verified — anonymizeUser is now atomic, deletes refresh
// tokens FIRST, and uses crypto.randomUUID() for collision-safe identifiers.
//
// The function is internal (not exported), so we exercise it through
// processExpiredCoolingOff which is the only caller. We assert on the
// shape of the SQL calls inside the trx client.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { processExpiredCoolingOff } from '../../src/services/data-management.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
});

describe('CRIT-N08 — anonymizeUser is atomic + deletes refresh tokens FIRST', () => {
  it('CRIT-N08 — all anonymization steps run on the trx client (single transaction)', async () => {
    // 1. SELECT expired cooling-off rows.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'req-1',
        user_id: 'user-1',
        status: 'processing',
        reason: null,
        requested_at: new Date(),
        cooling_off_ends_at: new Date(),
        processed_at: null,
        cancelled_at: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });

    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        if (/SELECT id FROM providers/.test(sql)) {
          return { rows: [], rowCount: 0 }; // not a provider
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    // 2. UPDATE account_deletion_requests after anonymizeUser succeeds.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const processed = await processExpiredCoolingOff();
    expect(processed).toBe(1);

    // The trx ran exactly once.
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);

    // The FIRST trx call MUST be DELETE FROM refresh_tokens — this is the
    // CRIT-N08 fix: invalidate sessions before touching user data.
    expect(txCalls[0]!.sql).toMatch(/DELETE FROM refresh_tokens/);
    expect(txCalls[0]!.params).toEqual(['user-1']);

    // Subsequent calls must include the standard cascade.
    const sqls = txCalls.map((c) => c.sql);
    expect(sqls.some((s) => /UPDATE users SET/.test(s))).toBe(true);
    expect(sqls.some((s) => /DELETE FROM user_addresses/.test(s))).toBe(true);
    expect(sqls.some((s) => /DELETE FROM push_tokens/.test(s))).toBe(true);
    expect(sqls.some((s) => /UPDATE reviews SET comment = ''/.test(s))).toBe(true);
    expect(sqls.some((s) => /UPDATE messages SET content = '\[deleted\]'/.test(s))).toBe(true);
  });

  it('CRIT-N08 — anonymized phone uses crypto.randomUUID hex (not Date.now)', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'req-1',
        user_id: 'user-1',
        status: 'processing',
        reason: null,
        requested_at: new Date(),
        cooling_off_ends_at: new Date(),
        processed_at: null,
        cancelled_at: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });

    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        if (/SELECT id FROM providers/.test(sql)) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await processExpiredCoolingOff();

    const userUpdateCall = txCalls.find((c) => /UPDATE users SET/.test(c.sql));
    expect(userUpdateCall).toBeDefined();
    const phone = userUpdateCall!.params[1] as string;
    const email = userUpdateCall!.params[2] as string;

    // Phone must be +63 followed by 10 digits (PH numbering plan).
    expect(phone).toMatch(/^\+63\d{10}$/);
    // Email format: deleted_<uuid>@anonymized.onservice.ph (no Date.now()).
    expect(email).toMatch(/^deleted_[a-z0-9]{32}@anonymized\.onservice\.ph$/);
  });

  it('CRIT-N08 — provider cascade ALSO runs on trx client when user is a provider', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'req-1',
        user_id: 'user-1',
        status: 'processing',
        reason: null,
        requested_at: new Date(),
        cooling_off_ends_at: new Date(),
        processed_at: null,
        cancelled_at: null,
        created_at: new Date(),
      }],
      rowCount: 1,
    });

    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        if (/SELECT id FROM providers/.test(sql)) {
          return { rows: [{ id: 'provider-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await processExpiredCoolingOff();

    const sqls = txCalls.map((c) => c.sql);
    expect(sqls.some((s) => /UPDATE providers SET/.test(s))).toBe(true);
    expect(sqls.some((s) => /UPDATE provider_services SET is_active = FALSE/.test(s))).toBe(true);
  });
});

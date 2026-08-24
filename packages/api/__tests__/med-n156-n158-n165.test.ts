// MED-N156 / MED-N158 / MED-N165 fixes verified.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// settings.service uses Redis as a hot-path cache; mock so getSetting
// falls through to the DB mock above without trying to connect.
jest.mock('../src/config/redis.config', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  },
}));

import {
  holdInEscrowInTransaction,
} from '../src/services/escrow.service';
import {
  debitWalletInTransaction,
  holdEscrowInTransaction,
} from '../src/services/wallet.service';
import { getSettingArray } from '../src/services/settings.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => dbQueryMock(sql, params),
    });
  });
});
describe('MED-N156 — escrow + wallet trx-aware variants', () => {
  it('MED-N156 — wallet.holdEscrowInTransaction writes UPDATE + INSERT on the SAME client', async () => {
    const calls: Array<{ sql: string }> = [];
    const fakeClient = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        calls.push({ sql });
        return { rows: [], rowCount: 1 };
      }),
    };
    await holdEscrowInTransaction(fakeClient, 'wallet-1', 1500, 'b1');
    expect(calls).toHaveLength(2);
    expect(calls[0]!.sql).toMatch(/UPDATE wallets[\s\S]*pending_balance/);
    expect(calls[1]!.sql).toMatch(/INSERT INTO wallet_transactions/);
  });

  it('MED-N156 — escrow.holdInEscrowInTransaction looks up the escrow wallet on the trx client', async () => {
    const calls: Array<{ sql: string }> = [];
    const fakeClient = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        calls.push({ sql });
        if (/SELECT id FROM wallets WHERE type/.test(sql)) {
          return { rows: [{ id: 'platform-escrow-wallet' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    await holdInEscrowInTransaction(fakeClient, 'b1', 1500);
    // 1 SELECT (escrow wallet lookup) + 2 from holdEscrowInTransaction.
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls[0]!.sql).toMatch(/SELECT id FROM wallets/);
  });

  it('MED-N156 — escrow.holdInEscrowInTransaction throws when no escrow wallet configured', async () => {
    const fakeClient = {
      query: jest.fn(async () => ({ rows: [], rowCount: 0 })),
    };
    await expect(holdInEscrowInTransaction(fakeClient, 'b1', 1000)).rejects.toThrow(/escrow wallet not configured/i);
  });
});

describe('MED-N158 — wallet.debitWalletInTransaction', () => {
  it('MED-N158 — UPDATE wallets WHERE available_balance >= amount + INSERT wallet_transactions', async () => {
    const calls: Array<{ sql: string }> = [];
    const fakeClient = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        calls.push({ sql });
        if (/UPDATE wallets/.test(sql)) {
          return { rows: [{ id: 'w-1', available_balance: 8500 }], rowCount: 1 };
        }
        return { rows: [{ id: 'tx-1' }], rowCount: 1 };
      }),
    };
    await debitWalletInTransaction(fakeClient, 'w-1', 1500, 'payment', 'pay for booking', 'b-1');
    expect(calls[0]!.sql).toMatch(/UPDATE wallets[\s\S]*available_balance >= \$1/);
    expect(calls[1]!.sql).toMatch(/INSERT INTO wallet_transactions/);
  });

  it('MED-N158 — throws 400 on insufficient balance (no INSERT runs)', async () => {
    let inserted = false;
    const fakeClient = {
      query: jest.fn(async (sql: string) => {
        if (/UPDATE wallets/.test(sql)) {
          // Update affects 0 rows because available_balance < amount.
          return { rows: [], rowCount: 0 };
        }
        inserted = true;
        return { rows: [], rowCount: 1 };
      }),
    };
    await expect(
      debitWalletInTransaction(fakeClient, 'w-1', 99999, 'payment', 'too much'),
    ).rejects.toThrow(/Insufficient/);
    expect(inserted).toBe(false);
  });
});

describe('MED-N165 — settings.getSettingArray returns trimmed string[]', () => {
  it('MED-N165 — splits on comma + trims + drops empties', async () => {
    // Mock db.query for getSetting → return a row with the value.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ value: 'office, condo_management ,  ,restaurant' }],
      rowCount: 1,
    });
    const out = await getSettingArray('business_account_types');
    expect(out).toEqual(['office', 'condo_management', 'restaurant']);
  });
});

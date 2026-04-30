// Phase 14 Dispatch 06 — Bug 78.
// adjustProviderWallet already wrapped wallet UPDATE + wallet_transactions
// INSERT in db.transaction, but had NO admin_actions audit row at all.
// Pre-D06: super-admin manual wallet adjustments left no traceable
// audit trail tying the actor's identity to the money mutation.
// Now: admin_actions INSERT happens INSIDE the same transaction so the
// audit and money are atomic.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { adjustProviderWallet } from '../../src/services/provider-admin.service';
import {
  resetDbMock,
  getTxCalls,
  getTopCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const PROVIDER_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const VALID_REASON = 'guarantee fund top-up after dispute resolution case #42';

beforeEach(() => {
  resetDbMock();
});

describe('Bug 78 — adjustProviderWallet records admin_actions inside its transaction', () => {
  it('inserts admin_actions row for credit adjustment', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT w\.id, w\.available_balance/, rows: [{ id: 'w1', available_balance: '50000' }], rowCount: 1 },
      { match: /UPDATE wallets/, rowCount: 1 },
      { match: /INSERT INTO wallet_transactions/, rows: [{ id: 'tx-001' }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-001' }], rowCount: 1 },
    ]));

    const result = await adjustProviderWallet(PROVIDER_ID, 25000, VALID_REASON, ADMIN_ID);

    expect(getTransactionInvocations()).toBe(1);
    expect(result.transactionId).toBe('tx-001');
    expect(result.newAvailableBalance).toBe(75000);

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    expect(auditCall!.sql).toContain("'provider_wallet_adjusted'");
    expect(auditCall!.sql).toContain("'provider'");
    expect(auditCall!.sql).toContain('full_notes');
    // params: [adminUserId, providerId, JSON, reason(slice 500), full_notes]
    expect(auditCall!.params[0]).toBe(ADMIN_ID);
    expect(auditCall!.params[1]).toBe(PROVIDER_ID);
    const details = JSON.parse(auditCall!.params[2] as string);
    expect(details.deltaAmount).toBe(25000);
    expect(details.previousBalance).toBe(50000);
    expect(details.newBalance).toBe(75000);
    expect(details.walletTransactionId).toBe('tx-001');
  });

  it('rolls back the wallet UPDATE + wallet_transactions INSERT when admin_actions fails (audit-failure scenario)', async () => {
    const auditErr = new Error('simulated CHECK constraint violation on action_type');
    setTxQueryImpl(makeRouter([
      { match: /SELECT w\.id, w\.available_balance/, rows: [{ id: 'w1', available_balance: '50000' }], rowCount: 1 },
      { match: /UPDATE wallets/, rowCount: 1 },
      { match: /INSERT INTO wallet_transactions/, rows: [{ id: 'tx-001' }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      adjustProviderWallet(PROVIDER_ID, 25000, VALID_REASON, ADMIN_ID),
    ).rejects.toThrow(/simulated CHECK constraint/);

    // The wallet UPDATE and wallet_transactions INSERT both happened on
    // the same client.query — when the audit insert throws, the runtime
    // ROLLBACK rewinds them. The mock can't simulate ROLLBACK directly
    // but we verify all three writes were attempted on the SAME client
    // (none leaked to top-level db.query) and the transaction did open.
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /UPDATE wallets|INSERT INTO/.test(c.sql))).toBeUndefined();

    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /UPDATE wallets/.test(c.sql))).toBeDefined();
    expect(txCalls.find((c) => /INSERT INTO wallet_transactions/.test(c.sql))).toBeDefined();
    expect(txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeDefined();
  });

  it('500 when admin_actions insert returns no id', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT w\.id, w\.available_balance/, rows: [{ id: 'w1', available_balance: '50000' }], rowCount: 1 },
      { match: /UPDATE wallets/, rowCount: 1 },
      { match: /INSERT INTO wallet_transactions/, rows: [{ id: 'tx-001' }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [], rowCount: 0 },
    ]));

    await expect(
      adjustProviderWallet(PROVIDER_ID, 25000, VALID_REASON, ADMIN_ID),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  it('debit adjustment also writes admin_actions', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT w\.id, w\.available_balance/, rows: [{ id: 'w1', available_balance: '100000' }], rowCount: 1 },
      { match: /UPDATE wallets/, rowCount: 1 },
      { match: /INSERT INTO wallet_transactions/, rows: [{ id: 'tx-002' }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-002' }], rowCount: 1 },
    ]));

    await adjustProviderWallet(PROVIDER_ID, -30000, VALID_REASON, ADMIN_ID);

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    const details = JSON.parse(auditCall!.params[2] as string);
    expect(details.deltaAmount).toBe(-30000);
    expect(details.newBalance).toBe(70000);
  });

  it('stores full reason in admin_actions.full_notes', async () => {
    const longReason = 'r'.repeat(700);
    setTxQueryImpl(makeRouter([
      { match: /SELECT w\.id, w\.available_balance/, rows: [{ id: 'w1', available_balance: '10000' }], rowCount: 1 },
      { match: /UPDATE wallets/, rowCount: 1 },
      { match: /INSERT INTO wallet_transactions/, rows: [{ id: 'tx-003' }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-003' }], rowCount: 1 },
    ]));

    await adjustProviderWallet(PROVIDER_ID, 1000, longReason, ADMIN_ID);

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall!.params[3]).toBe('r'.repeat(500));
    expect(auditCall!.params[4]).toBe(longReason);
  });
});

// Phase 14 Dispatch 06 — Bug 106.
// business.service.transferOwnership did not exist pre-D06 — the audit
// caught a planned-but-not-implemented feature. Implementation is the
// D06 transactional pattern: UPDATE business_accounts.owner_user_id +
// UPDATE both members' roles + INSERT admin_actions audit, all in ONE
// transaction.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/services/notification.service', () => ({
  createNotification: jest.fn(),
}));

import { transferOwnership } from '../../src/services/business.service';
import {
  resetDbMock,
  getTxCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const CURRENT_OWNER_ID = 'o0000000-0000-0000-0000-000000000001';
const NEW_OWNER_ID = 'n0000000-0000-0000-0000-000000000001';

beforeEach(resetDbMock);

describe('Bug 106 — business.transferOwnership transactional', () => {
  it('atomically swaps owner_user_id + both member roles + writes audit', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, owner_user_id FROM business_accounts/, rows: [{ id: BUSINESS_ID, owner_user_id: CURRENT_OWNER_ID }], rowCount: 1 },
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2$/, rows: [{ id: 'new-mem', role: 'member', deleted_at: null }], rowCount: 1, onceOnly: true },
      { match: /SELECT id FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2 AND deleted_at IS NULL/, rows: [{ id: 'old-mem' }], rowCount: 1 },
      { match: /UPDATE business_members\s+SET role = 'manager'/, rowCount: 1 },
      { match: /UPDATE business_members\s+SET role = 'owner'/, rowCount: 1 },
      { match: /UPDATE business_accounts SET owner_user_id/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-xfer' }], rowCount: 1 },
    ]));

    await transferOwnership(BUSINESS_ID, CURRENT_OWNER_ID, NEW_OWNER_ID, 'planned succession');

    expect(getTransactionInvocations()).toBe(1);
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /SET role = 'manager'/.test(c.sql))).toBeDefined();
    expect(txCalls.find((c) => /SET role = 'owner'/.test(c.sql))).toBeDefined();
    expect(txCalls.find((c) => /UPDATE business_accounts SET owner_user_id/.test(c.sql))).toBeDefined();
    const audit = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit!.sql).toContain("'business_ownership_transferred'");
  });

  it('rejects transferring to self with 400', async () => {
    await expect(
      transferOwnership(BUSINESS_ID, CURRENT_OWNER_ID, CURRENT_OWNER_ID),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(getTransactionInvocations()).toBe(0);
  });

  it('rejects 404 when business account missing', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, owner_user_id FROM business_accounts/, rows: [], rowCount: 0 },
    ]));
    await expect(
      transferOwnership(BUSINESS_ID, CURRENT_OWNER_ID, NEW_OWNER_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects 403 when requester is not the current owner', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, owner_user_id FROM business_accounts/, rows: [{ id: BUSINESS_ID, owner_user_id: 'someone-else' }], rowCount: 1 },
    ]));
    await expect(
      transferOwnership(BUSINESS_ID, CURRENT_OWNER_ID, NEW_OWNER_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects 404 when new owner is not a member', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, owner_user_id FROM business_accounts/, rows: [{ id: BUSINESS_ID, owner_user_id: CURRENT_OWNER_ID }], rowCount: 1 },
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2$/, rows: [], rowCount: 0 },
    ]));
    await expect(
      transferOwnership(BUSINESS_ID, CURRENT_OWNER_ID, NEW_OWNER_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects 404 when new owner is soft-deleted', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, owner_user_id FROM business_accounts/, rows: [{ id: BUSINESS_ID, owner_user_id: CURRENT_OWNER_ID }], rowCount: 1 },
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2$/, rows: [{ id: 'new-mem', role: 'member', deleted_at: new Date() }], rowCount: 1 },
    ]));
    await expect(
      transferOwnership(BUSINESS_ID, CURRENT_OWNER_ID, NEW_OWNER_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rolls back when admin_actions INSERT throws (audit-failure scenario)', async () => {
    const auditErr = new Error('simulated audit failure');
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, owner_user_id FROM business_accounts/, rows: [{ id: BUSINESS_ID, owner_user_id: CURRENT_OWNER_ID }], rowCount: 1 },
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2$/, rows: [{ id: 'new-mem', role: 'member', deleted_at: null }], rowCount: 1 },
      { match: /SELECT id FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2 AND deleted_at IS NULL/, rows: [{ id: 'old-mem' }], rowCount: 1 },
      { match: /UPDATE business_members/, rowCount: 1 },
      { match: /UPDATE business_accounts SET owner_user_id/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      transferOwnership(BUSINESS_ID, CURRENT_OWNER_ID, NEW_OWNER_ID, 'reason'),
    ).rejects.toThrow(/simulated audit failure/);
  });
});

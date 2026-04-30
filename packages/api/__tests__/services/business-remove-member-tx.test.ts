// Phase 14 Dispatch 06 — Bug 105.
// business.service.removeMember must do soft delete + admin_actions audit
// inside ONE db.transaction. Pre-D06: hard DELETE with NO audit. Now:
// soft delete (deleted_at column from migration 076) + audit row inside
// the same transaction so the audit's target_id FK to business_members
// remains valid.

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

import { removeMember } from '../../src/services/business.service';
import {
  resetDbMock,
  getTxCalls,
  getTopCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const BUSINESS_ID = 'b0000000-0000-0000-0000-000000000001';
const REQUESTER_ID = 'r0000000-0000-0000-0000-000000000001';
const TARGET_USER_ID = 't0000000-0000-0000-0000-000000000001';
const MEMBER_ROW_ID = 'm0000000-0000-0000-0000-000000000001';

beforeEach(resetDbMock);

describe('Bug 105 — business.removeMember soft delete + audit', () => {
  it('soft-deletes (UPDATE deleted_at) and writes audit inside one transaction (no hard DELETE)', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2 AND deleted_at IS NULL/, rows: [{ id: 'req-1', role: 'owner', deleted_at: null }], rowCount: 1 },
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2$/, rows: [{ id: MEMBER_ROW_ID, role: 'member', deleted_at: null }], rowCount: 1 },
      { match: /UPDATE business_members\s+SET deleted_at = NOW\(\)/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-rm' }], rowCount: 1 },
    ]));

    await removeMember(BUSINESS_ID, REQUESTER_ID, TARGET_USER_ID, 'misconduct');

    expect(getTransactionInvocations()).toBe(1);
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /UPDATE business_members/.test(c.sql))).toBeDefined();
    expect(txCalls.find((c) => /^DELETE FROM/.test(c.sql))).toBeUndefined();

    const audit = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit!.sql).toContain("'business_member_removed'");
    expect(audit!.sql).toContain("'business'");
    expect(audit!.sql).toContain('full_notes');

    // No top-level mutation leaked.
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /UPDATE business_members|INSERT INTO admin_actions|DELETE FROM/.test(c.sql))).toBeUndefined();
  });

  it('rolls back when admin_actions INSERT throws (audit-failure scenario)', async () => {
    const auditErr = new Error('simulated audit failure');
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2 AND deleted_at IS NULL/, rows: [{ id: 'req-1', role: 'owner', deleted_at: null }], rowCount: 1 },
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2$/, rows: [{ id: MEMBER_ROW_ID, role: 'member', deleted_at: null }], rowCount: 1 },
      { match: /UPDATE business_members/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(
      removeMember(BUSINESS_ID, REQUESTER_ID, TARGET_USER_ID, 'reason'),
    ).rejects.toThrow(/simulated audit failure/);
  });

  it('rejects 403 when requester is not owner/manager', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2 AND deleted_at IS NULL/, rows: [{ id: 'req-1', role: 'member', deleted_at: null }], rowCount: 1 },
    ]));
    await expect(
      removeMember(BUSINESS_ID, REQUESTER_ID, TARGET_USER_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects 404 when target member missing', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2 AND deleted_at IS NULL/, rows: [{ id: 'req-1', role: 'owner', deleted_at: null }], rowCount: 1 },
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2$/, rows: [], rowCount: 0 },
    ]));
    await expect(
      removeMember(BUSINESS_ID, REQUESTER_ID, TARGET_USER_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects 409 when target already soft-deleted', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2 AND deleted_at IS NULL/, rows: [{ id: 'req-1', role: 'owner', deleted_at: null }], rowCount: 1 },
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2$/, rows: [{ id: MEMBER_ROW_ID, role: 'member', deleted_at: new Date() }], rowCount: 1 },
    ]));
    await expect(
      removeMember(BUSINESS_ID, REQUESTER_ID, TARGET_USER_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects 403 when target is the owner', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2 AND deleted_at IS NULL/, rows: [{ id: 'req-1', role: 'manager', deleted_at: null }], rowCount: 1 },
      { match: /SELECT id, role, deleted_at FROM business_members\s+WHERE business_account_id = \$1 AND user_id = \$2$/, rows: [{ id: MEMBER_ROW_ID, role: 'owner', deleted_at: null }], rowCount: 1 },
    ]));
    await expect(
      removeMember(BUSINESS_ID, REQUESTER_ID, TARGET_USER_ID),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

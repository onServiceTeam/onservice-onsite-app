// Phase 14 Dispatch 06 — Bug 84.
// dispute.service.escalateDispute must do dispute UPDATE + admin_actions
// audit inside ONE db.transaction. Pre-D06 these were two separate
// top-level db.query calls — if the audit insert failed, the dispute
// status had already escalated without an audit trail.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { escalateDispute } from '../../src/services/dispute.service';
import {
  resetDbMock,
  getTxCalls,
  getTopCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const DISPUTE_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';
const REASON = 'customer pressing for tier-2 review after no provider response';

beforeEach(resetDbMock);

describe('Bug 84 — escalateDispute transactional', () => {
  it('opens one transaction containing dispute UPDATE + admin_actions audit', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM disputes WHERE id = \$1 FOR UPDATE/, rows: [{ id: DISPUTE_ID, status: 'open', tier: 1 }], rowCount: 1 },
      { match: /UPDATE disputes/, rows: [{ id: DISPUTE_ID, status: 'escalated', tier: 2 }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-esc' }], rowCount: 1 },
    ]));

    await escalateDispute(DISPUTE_ID, ADMIN_ID, REASON);

    expect(getTransactionInvocations()).toBe(1);
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /UPDATE disputes/.test(c.sql))).toBeDefined();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(auditCall).toBeDefined();
    expect(auditCall!.sql).toContain("'dispute_escalated'");
    expect(auditCall!.sql).toContain('full_notes');

    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /UPDATE disputes|INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
  });

  it('rolls back when admin_actions INSERT throws (Bug 84 audit-failure)', async () => {
    const auditErr = new Error('simulated audit failure');
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM disputes WHERE id = \$1 FOR UPDATE/, rows: [{ id: DISPUTE_ID, status: 'open', tier: 1 }], rowCount: 1 },
      { match: /UPDATE disputes/, rows: [{ id: DISPUTE_ID, status: 'escalated', tier: 2 }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(escalateDispute(DISPUTE_ID, ADMIN_ID, REASON)).rejects.toThrow(/simulated audit failure/);

    // No top-level audit insert leaked.
    const topCalls = getTopCalls();
    expect(topCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql))).toBeUndefined();
  });

  it('throws 404 when dispute not found', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM disputes WHERE id = \$1 FOR UPDATE/, rows: [], rowCount: 0 },
    ]));
    await expect(escalateDispute(DISPUTE_ID, ADMIN_ID, REASON)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 409 when dispute already resolved', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM disputes WHERE id = \$1 FOR UPDATE/, rows: [{ id: DISPUTE_ID, status: 'resolved', tier: 2 }], rowCount: 1 },
    ]));
    await expect(escalateDispute(DISPUTE_ID, ADMIN_ID, REASON)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('throws 409 when dispute already at max tier', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM disputes WHERE id = \$1 FOR UPDATE/, rows: [{ id: DISPUTE_ID, status: 'escalated', tier: 3 }], rowCount: 1 },
    ]));
    await expect(escalateDispute(DISPUTE_ID, ADMIN_ID, REASON)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('stores full reason in full_notes column', async () => {
    const longReason = 'r'.repeat(750);
    setTxQueryImpl(makeRouter([
      { match: /SELECT \* FROM disputes WHERE id = \$1 FOR UPDATE/, rows: [{ id: DISPUTE_ID, status: 'open', tier: 1 }], rowCount: 1 },
      { match: /UPDATE disputes/, rows: [{ id: DISPUTE_ID, status: 'escalated', tier: 2 }], rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-esc' }], rowCount: 1 },
    ]));

    await escalateDispute(DISPUTE_ID, ADMIN_ID, longReason);

    const txCalls = getTxCalls();
    const auditCall = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    // params: [adminId, disputeId, JSON, reason(slice 500), full_notes]
    expect(auditCall!.params[3]).toBe('r'.repeat(500));
    expect(auditCall!.params[4]).toBe(longReason);
  });
});

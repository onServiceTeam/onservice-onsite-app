// Phase 14 Dispatch 06 — Bug 127.
// staff.service.deleteRole (the audit-cited "roles.service.deleteRole",
// which actually lives in staff.service.ts per the D06 plan addendum)
// must do soft delete + admin_actions audit inside ONE db.transaction.
// Pre-D06 hard DELETE with NO audit.

jest.mock('../../src/models/db', () => {
  const helper = jest.requireActual('../helpers/d06-tx-mock') as typeof import('../helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { deleteRole } from '../../src/services/staff.service';
import {
  resetDbMock,
  getTxCalls,
  getTransactionInvocations,
  setTxQueryImpl,
  makeRouter,
} from '../helpers/d06-tx-mock';

const ROLE_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';

beforeEach(resetDbMock);

describe('Bug 127 — staff.deleteRole soft delete + audit', () => {
  it('UPDATEs deleted_at + writes admin_actions audit inside one transaction (no hard DELETE)', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, name, deleted_at FROM admin_roles WHERE id = \$1 FOR UPDATE/, rows: [{ id: ROLE_ID, name: 'moderator', deleted_at: null }], rowCount: 1 },
      { match: /SELECT COUNT\(\*\) AS count FROM admin_staff WHERE role_id/, rows: [{ count: '0' }], rowCount: 1 },
      { match: /UPDATE admin_roles\s+SET deleted_at = NOW\(\)/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, rows: [{ id: 'audit-role-archive' }], rowCount: 1 },
    ]));

    await deleteRole(ROLE_ID, ADMIN_ID, 'role no longer needed');

    expect(getTransactionInvocations()).toBe(1);
    const txCalls = getTxCalls();
    expect(txCalls.find((c) => /UPDATE admin_roles/.test(c.sql))).toBeDefined();
    expect(txCalls.find((c) => /^DELETE FROM admin_roles/.test(c.sql))).toBeUndefined();

    const audit = txCalls.find((c) => /INSERT INTO admin_actions/.test(c.sql));
    expect(audit).toBeDefined();
    expect(audit!.sql).toContain("'admin_role_archived'");
    expect(audit!.sql).toContain("'admin_role'");
  });

  it('rejects 404 when role not found or already deleted', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, name, deleted_at FROM admin_roles WHERE id = \$1 FOR UPDATE/, rows: [], rowCount: 0 },
    ]));
    await expect(deleteRole(ROLE_ID, ADMIN_ID, 'Role profile is no longer required.')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects 404 when role already soft-deleted', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, name, deleted_at FROM admin_roles WHERE id = \$1 FOR UPDATE/, rows: [{ id: ROLE_ID, name: 'moderator', deleted_at: new Date() }], rowCount: 1 },
    ]));
    await expect(deleteRole(ROLE_ID, ADMIN_ID, 'Role profile is no longer required.')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects 403 when archiving super_admin', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, name, deleted_at FROM admin_roles WHERE id = \$1 FOR UPDATE/, rows: [{ id: ROLE_ID, name: 'super_admin', deleted_at: null }], rowCount: 1 },
    ]));
    await expect(deleteRole(ROLE_ID, ADMIN_ID, 'Role profile is no longer required.')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects 409 when role has active staff assigned', async () => {
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, name, deleted_at FROM admin_roles WHERE id = \$1 FOR UPDATE/, rows: [{ id: ROLE_ID, name: 'moderator', deleted_at: null }], rowCount: 1 },
      { match: /SELECT COUNT\(\*\) AS count FROM admin_staff WHERE role_id/, rows: [{ count: '3' }], rowCount: 1 },
    ]));
    await expect(deleteRole(ROLE_ID, ADMIN_ID, 'Role profile is no longer required.')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rolls back when admin_actions INSERT throws (audit-failure scenario)', async () => {
    const auditErr = new Error('simulated audit failure');
    setTxQueryImpl(makeRouter([
      { match: /SELECT id, name, deleted_at FROM admin_roles WHERE id = \$1 FOR UPDATE/, rows: [{ id: ROLE_ID, name: 'moderator', deleted_at: null }], rowCount: 1 },
      { match: /SELECT COUNT\(\*\) AS count FROM admin_staff WHERE role_id/, rows: [{ count: '0' }], rowCount: 1 },
      { match: /UPDATE admin_roles/, rowCount: 1 },
      { match: /INSERT INTO admin_actions/, throwError: auditErr },
    ]));

    await expect(deleteRole(ROLE_ID, ADMIN_ID, 'Role profile is no longer required.')).rejects.toThrow(/simulated audit failure/);
  });
});

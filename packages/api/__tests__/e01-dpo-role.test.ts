// E01 / D15 — DPO role end-to-end implementation.
//
// Covers:
//  1. Migration 106 adds 'dpo' to users.role CHECK + new admin_actions types.
//  2. AuthPayload + UserRole include 'dpo'.
//  3. requireDpoRole grants super_admin AND dpo, rejects others.
//  4. JWT issuance accepts 'dpo' (signAccessToken takes role: string).
//  5. promoteToDpo / demoteFromDpo / listDpos write trx + audit row.
//  6. Bootstrap-admin script accepts ADMIN_BOOTSTRAP_ROLE='dpo'.

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

import { promoteToDpo, demoteFromDpo, listDpos } from '../src/services/staff.service';
import { requireDpoRole, requireSuperAdminRole } from '../src/middleware/require-dpo.middleware';
import type { AuthenticatedRequest, AuthPayload } from '../src/middleware/auth.middleware';
import { roleIsAllowed } from '../../api/scripts/bootstrap-admin';
import type { Response } from 'express';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const DPO_REASON = 'Approved DPO assignment for privacy operations.';

const MIGRATION_106 = readFileSync(
  resolve(__dirname, '../migrations/106_dpo_role_e01.sql'),
  'utf8',
);
const AUTH_MIDDLEWARE = readFileSync(
  resolve(__dirname, '../src/middleware/auth.middleware.ts'),
  'utf8',
);
const USER_TYPES = readFileSync(
  resolve(__dirname, '../src/types/user.types.ts'),
  'utf8',
);
const RBAC_MIDDLEWARE = readFileSync(
  resolve(__dirname, '../src/middleware/rbac.middleware.ts'),
  'utf8',
);
const AUTH_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/auth.routes.ts'),
  'utf8',
);

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

describe('E01 — migration 106 adds dpo to users.role + audit types', () => {
  it('E01 — users.role CHECK includes dpo', () => {
    expect(MIGRATION_106).toMatch(/CHECK \(role IN \([^)]*'dpo'/);
  });

  it('E01 — admin_actions.action_type CHECK includes promote+demote', () => {
    expect(MIGRATION_106).toMatch(/'staff_role_promoted_dpo'/);
    expect(MIGRATION_106).toMatch(/'staff_role_demoted_from_dpo'/);
  });

  it('E01 — migration drops old constraint defensively', () => {
    expect(MIGRATION_106).toMatch(/DROP CONSTRAINT IF EXISTS users_role_check/);
  });
});

describe('E01 — type system includes dpo', () => {
  it('E01 — UserRole union includes dpo', () => {
    expect(USER_TYPES).toMatch(/'customer'\s*\|\s*'provider'\s*\|\s*'admin'\s*\|\s*'super_admin'\s*\|\s*'dpo'/);
  });

  it('E01 — AuthPayload role union includes dpo', () => {
    expect(AUTH_MIDDLEWARE).toMatch(/role:\s*'customer'\s*\|\s*'provider'\s*\|\s*'admin'\s*\|\s*'super_admin'\s*\|\s*'dpo'/);
  });

  it('E01 — rbac UserRole union includes dpo', () => {
    expect(RBAC_MIDDLEWARE).toMatch(/'customer'\s*\|\s*'provider'\s*\|\s*'admin'\s*\|\s*'super_admin'\s*\|\s*'dpo'/);
  });

  it('E01 — DPO_AUTHORIZED_ROLES helper set exists', () => {
    expect(USER_TYPES).toMatch(/DPO_AUTHORIZED_ROLES/);
  });
});

describe('E01 — admin login flow accepts dpo', () => {
  it('E01 — /admin/login WHERE clause includes dpo', () => {
    expect(AUTH_ROUTES).toMatch(/role IN \('admin', 'super_admin', 'dpo'\)/);
  });

  it('E01 — 2FA enrollment forced for dpo too', () => {
    // The forced-enrollment branch covers admin/super_admin/dpo.
    expect(AUTH_ROUTES).toMatch(/user\.role === 'admin' \|\| user\.role === 'super_admin' \|\| user\.role === 'dpo'/);
  });
});

describe('E01 — requireDpoRole middleware admits dpo and super_admin only', () => {
  function callMiddleware(role: AuthPayload['role']): { error: Error | null } {
    let captured: Error | null = null;
    requireDpoRole(
      { user: { userId: 'u1', role, iat: 0, exp: 0 } } as AuthenticatedRequest,
      {} as Response,
      (err?: unknown) => {
        if (err instanceof Error) captured = err;
      },
    );
    return { error: captured };
  }

  it('E01 — super_admin passes', () => {
    expect(callMiddleware('super_admin').error).toBeNull();
  });

  it('E01 — dpo passes', () => {
    expect(callMiddleware('dpo').error).toBeNull();
  });

  it('E01 — admin rejected with 403', () => {
    const out = callMiddleware('admin');
    expect(out.error).not.toBeNull();
    expect(out.error!.message).toMatch(/DPO or super_admin/);
  });

  it('E01 — customer rejected', () => {
    expect(callMiddleware('customer').error).not.toBeNull();
  });

  it('E01 — provider rejected', () => {
    expect(callMiddleware('provider').error).not.toBeNull();
  });

  it('E01 — requireSuperAdminRole still excludes dpo (segregation)', () => {
    let captured: Error | null = null;
    requireSuperAdminRole(
      { user: { userId: 'u1', role: 'dpo', iat: 0, exp: 0 } } as AuthenticatedRequest,
      {} as Response,
      (err?: unknown) => {
        if (err instanceof Error) captured = err;
      },
    );
    expect(captured).not.toBeNull();
    expect(captured!.message).toMatch(/super_admin role/);
  });
});

describe('E01 — bootstrap-admin allows dpo role', () => {
  it('E01 — roleIsAllowed("dpo") returns true', () => {
    expect(roleIsAllowed('dpo')).toBe(true);
  });
});

describe('E01 — promoteToDpo writes UPDATE + audit row in single trx', () => {
  it('E01 — promotes a non-DPO user; UPDATE users + INSERT admin_actions in one trx', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', role: 'admin', is_active: true }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // advisory lock
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // vacant DPO seat
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT audit

    const out = await promoteToDpo('u1', 'super-1', DPO_REASON);

    expect(out).toEqual({ userId: 'u1', previousRole: 'admin', newRole: 'dpo' });
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(dbQueryMock).toHaveBeenCalledTimes(5);

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toMatch(/'staff_role_promoted_dpo'/);
    const params = auditCall![1] as unknown[];
    expect(params[0]).toBe('super-1');
    expect(params[1]).toBe('u1');
    expect(JSON.parse(params[2] as string)).toEqual({ previousRole: 'admin', newRole: 'dpo' });
  });

  it('E01 — idempotent if already dpo (no audit row written)', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', role: 'dpo', is_active: true }],
      rowCount: 1,
    });
    const out = await promoteToDpo('u1', 'super-1', DPO_REASON);
    expect(out).toEqual({ userId: 'u1', previousRole: 'dpo', newRole: 'dpo' });
    // Only the SELECT FOR UPDATE — no UPDATE, no audit row.
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
  });

  it('E01 — refuses to promote a super_admin (segregation)', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', role: 'super_admin', is_active: true }],
      rowCount: 1,
    });
    await expect(promoteToDpo('u1', 'super-1', DPO_REASON)).rejects.toThrow(/Super admins already hold DPO/);
  });

  it('E01 — refuses to promote a deactivated user', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', role: 'admin', is_active: false }],
      rowCount: 1,
    });
    await expect(promoteToDpo('u1', 'super-1', DPO_REASON)).rejects.toThrow(/deactivated/);
  });

  it('E01 — refuses if user not found', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(promoteToDpo('nope', 'super-1', DPO_REASON)).rejects.toThrow(/not found/);
  });
});

describe('E01 — demoteFromDpo writes UPDATE + audit row in single trx', () => {
  it('E01 — demotes a DPO back to admin by default', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', role: 'dpo' }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await demoteFromDpo('u1', 'super-1', DPO_REASON);

    expect(out).toEqual({ userId: 'u1', previousRole: 'dpo', newRole: 'admin' });

    const updateCall = dbQueryMock.mock.calls.find(
      ([sql]) => /UPDATE users SET role/.test(sql as string),
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![1] as unknown[])[1]).toBe('admin');

    const auditCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO admin_actions/.test(sql as string),
    );
    expect(auditCall).toBeDefined();
    expect(auditCall![0]).toMatch(/'staff_role_demoted_from_dpo'/);
  });

  it('E01 — accepts custom demoteTo', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', role: 'dpo' }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await demoteFromDpo('u1', 'super-1', DPO_REASON, 'customer');
    expect(out.newRole).toBe('customer');
  });

  it('E01 — refuses to demote a non-DPO', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'u1', role: 'admin' }],
      rowCount: 1,
    });
    await expect(demoteFromDpo('u1', 'super-1', DPO_REASON)).rejects.toThrow(/not currently a DPO/);
  });

  it('E01 — rejects invalid demoteTo', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      demoteFromDpo('u1', 'super-1', DPO_REASON, 'super_admin' as any),
    ).rejects.toThrow(/Invalid demoteTo/);
  });
});

describe('E01 — listDpos returns active DPOs only', () => {
  it('E01 — query filters role=dpo + is_active=TRUE', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { id: 'u1', email: 'dpo@x.com', first_name: 'Dee', last_name: 'Pee', promoted_at: '2026-05-01' },
      ],
      rowCount: 1,
    });
    const out = await listDpos();
    expect(out).toHaveLength(1);
    expect(out[0]!.email).toBe('dpo@x.com');

    const sql = dbQueryMock.mock.calls[0]![0] as string;
    expect(sql).toMatch(/role = 'dpo'/);
    expect(sql).toMatch(/is_active = TRUE/);
  });
});

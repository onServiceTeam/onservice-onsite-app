// LAUNCH-LIMITATIONS #12 — admin password rotation campaign.
//
// Verifies:
//   1. getLegacyPasswordStats returns the four counts derived from a
//      single COUNT FILTER query against users.
//   2. flagLegacyHashesForRotation sets must_rotate_password=TRUE on
//      legacy-hash admin accounts and writes a single audit row.
//   3. changeOwnAdminPassword verifies old password, validates new
//      password length, hashes with current scrypt N, clears the flag,
//      and writes an audit row. All inside a transaction.
//   4. Routes are wired with auth + super_admin gates as appropriate.

import express from 'express';
import request from 'supertest';

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (fn: unknown) => dbTransactionMock(fn),
  },
}));

jest.mock('../src/middleware/auth.middleware', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    const role = req.header('x-test-role') ?? 'admin';
    (req as express.Request & { user: unknown }).user = {
      userId: `${role}-rotation-user`, role, iat: 0, exp: 0,
    };
    next();
  },
}));

import * as passwordRotation from '../src/services/admin-password-rotation.service';
import { hashPassword, SCRYPT_N, HASH_VERSION } from '../src/services/auth.service';
import securityRouter from '../src/routes/security.routes';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
});

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

describe('LAUNCH-LIMITATIONS #12 — getLegacyPasswordStats', () => {
  it('#12 — returns total, legacy, current, mustRotate counts', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        total: '10',
        legacy: '3',
        current: '7',
        must_rotate: '2',
      }],
      rowCount: 1,
    });

    const stats = await passwordRotation.getLegacyPasswordStats();
    expect(stats).toEqual({
      total: 10,
      legacy: 3,
      current: 7,
      mustRotate: 2,
    });

    // SQL must filter to admin tier roles only.
    const params = dbQueryMock.mock.calls[0][1] as unknown[];
    expect(params[1]).toEqual(['admin', 'super_admin', 'dpo']);
    // Pattern uses the canonical scrypt prefix with current N.
    expect(params[0]).toBe(`${HASH_VERSION}:${SCRYPT_N}:%`);
  });

  it('#12 — handles empty user table gracefully', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const stats = await passwordRotation.getLegacyPasswordStats();
    expect(stats).toEqual({ total: 0, legacy: 0, current: 0, mustRotate: 0 });
  });
});

describe('LAUNCH-LIMITATIONS #12 — flagLegacyHashesForRotation', () => {
  it('#12 — flips must_rotate_password=TRUE on legacy-hash rows + audits once', async () => {
    const clientMock = jest.fn();

    // First UPDATE returns 3 rows newly flagged.
    clientMock
      .mockResolvedValueOnce({
        rows: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
        rowCount: 3,
      })
      // Second SELECT counts already-flagged (1 was already flagged).
      .mockResolvedValueOnce({ rows: [{ cnt: '4' }], rowCount: 1 })
      // Third INSERT writes audit_actions row.
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    dbTransactionMock.mockImplementationOnce(async (fn: (c: unknown) => Promise<unknown>) =>
      fn({ query: clientMock })
    );

    const result = await passwordRotation.flagLegacyHashesForRotation(ADMIN_ID);
    expect(result).toEqual({
      affected: 4,
      newlyFlagged: 3,
      alreadyFlagged: 1,
    });

    // Audit insert is the third call; check the action_type + admin id.
    const auditCall = clientMock.mock.calls[2];
    const auditSql = auditCall[0] as string;
    const auditParams = auditCall[1] as unknown[];
    expect(auditSql).toMatch(/INSERT INTO admin_actions/);
    expect(auditSql).toMatch(/legacy_password_rotation_flagged/);
    expect(auditParams[0]).toBe(ADMIN_ID);
    const details = JSON.parse(auditParams[1] as string) as { newlyFlagged: number; scryptN: number };
    expect(details.newlyFlagged).toBe(3);
    expect(details.scryptN).toBe(SCRYPT_N);
  });

  it('#12 — empty adminUserId throws 400', async () => {
    await expect(passwordRotation.flagLegacyHashesForRotation('')).rejects.toMatchObject({
      message: expect.stringMatching(/adminUserId is required/),
    });
  });
});

describe('LAUNCH-LIMITATIONS #12 — changeOwnAdminPassword', () => {
  // Use a real hash so verifyPasswordWithRehash actually runs against it.
  const realPassword = 'correct-horse-battery-staple-v1';
  const realHash = hashPassword(realPassword);

  function setupAdminLookup(client: jest.Mock, opts: {
    role: string;
    hash: string | null;
  }): void {
    client.mockResolvedValueOnce({
      rows: [{
        id: ADMIN_ID,
        role: opts.role,
        password_hash: opts.hash,
      }],
      rowCount: 1,
    });
  }

  it('#12 — happy path: verifies old, hashes new, clears flag, audits', async () => {
    const clientMock = jest.fn();
    setupAdminLookup(clientMock, { role: 'admin', hash: realHash });
    clientMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE
    clientMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT audit

    dbTransactionMock.mockImplementationOnce(async (fn: (c: unknown) => Promise<unknown>) =>
      fn({ query: clientMock })
    );

    await passwordRotation.changeOwnAdminPassword({
      userId: ADMIN_ID,
      oldPassword: realPassword,
      newPassword: 'a-different-password-2026',
    });

    // UPDATE clears must_rotate_password.
    const updateCall = clientMock.mock.calls[1];
    const updateSql = updateCall[0] as string;
    expect(updateSql).toMatch(/must_rotate_password = FALSE/);
    expect(updateSql).toMatch(/UPDATE users/);

    // Audit row carries admin_password_rotated.
    const auditCall = clientMock.mock.calls[2];
    expect(auditCall[0]).toMatch(/admin_password_rotated/);
  });

  it('#12 — rejects wrong old password', async () => {
    const clientMock = jest.fn();
    setupAdminLookup(clientMock, { role: 'admin', hash: realHash });

    dbTransactionMock.mockImplementationOnce(async (fn: (c: unknown) => Promise<unknown>) =>
      fn({ query: clientMock })
    );

    await expect(passwordRotation.changeOwnAdminPassword({
      userId: ADMIN_ID,
      oldPassword: 'definitely-not-the-password',
      newPassword: 'something-else-long-enough',
    })).rejects.toMatchObject({
      message: expect.stringMatching(/old password is incorrect/i),
    });
  });

  it('#12 — rejects non-admin role', async () => {
    const clientMock = jest.fn();
    setupAdminLookup(clientMock, { role: 'customer', hash: realHash });

    dbTransactionMock.mockImplementationOnce(async (fn: (c: unknown) => Promise<unknown>) =>
      fn({ query: clientMock })
    );

    await expect(passwordRotation.changeOwnAdminPassword({
      userId: ADMIN_ID,
      oldPassword: realPassword,
      newPassword: 'a-different-password-2026',
    })).rejects.toMatchObject({
      message: expect.stringMatching(/admin-tier accounts/),
    });
  });

  it('#12 — rejects new password shorter than 12 chars', async () => {
    await expect(passwordRotation.changeOwnAdminPassword({
      userId: ADMIN_ID,
      oldPassword: 'whatever',
      newPassword: 'short',
    })).rejects.toMatchObject({
      message: expect.stringMatching(/between 12 and 128 characters/),
    });
  });

  it('#12 — rejects new == old', async () => {
    await expect(passwordRotation.changeOwnAdminPassword({
      userId: ADMIN_ID,
      oldPassword: 'same-password-12345',
      newPassword: 'same-password-12345',
    })).rejects.toMatchObject({
      message: expect.stringMatching(/must differ from the current password/),
    });
  });

  it('#12 — rejects when password login not configured', async () => {
    const clientMock = jest.fn();
    setupAdminLookup(clientMock, { role: 'admin', hash: null });

    dbTransactionMock.mockImplementationOnce(async (fn: (c: unknown) => Promise<unknown>) =>
      fn({ query: clientMock })
    );

    await expect(passwordRotation.changeOwnAdminPassword({
      userId: ADMIN_ID,
      oldPassword: realPassword,
      newPassword: 'a-different-password-2026',
    })).rejects.toMatchObject({
      message: expect.stringMatching(/Password login not configured/),
    });
  });
});

describe('LAUNCH-LIMITATIONS #12 — route wiring', () => {
  it('#12 — mounted password-rotation routes enforce role boundaries and forward the current account', async () => {
    const statsSpy = jest.spyOn(passwordRotation, 'getLegacyPasswordStats').mockResolvedValue({
      total: 4, legacy: 2, current: 2, mustRotate: 1,
    });
    const flagSpy = jest.spyOn(passwordRotation, 'flagLegacyHashesForRotation').mockResolvedValue({
      affected: 2, newlyFlagged: 1, alreadyFlagged: 1,
    });
    const changeSpy = jest.spyOn(passwordRotation, 'changeOwnAdminPassword').mockResolvedValue(undefined);
    const app = express();
    app.use(express.json());
    app.use('/security', securityRouter);
    app.use((
      error: { statusCode?: number; message?: string },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(error.statusCode ?? 500).json({ error: error.message ?? 'error' }));

    const adminStats = await request(app).get('/security/admin/legacy-password-stats');
    const dpoStats = await request(app)
      .get('/security/admin/legacy-password-stats')
      .set('x-test-role', 'dpo');
    const adminFlag = await request(app).post('/security/admin/flag-legacy-password-hashes');
    const superAdminFlag = await request(app)
      .post('/security/admin/flag-legacy-password-hashes')
      .set('x-test-role', 'super_admin');
    const ownChange = await request(app)
      .post('/security/admin/me/change-password')
      .set('x-test-role', 'dpo')
      .send({ oldPassword: 'old-password-value', newPassword: 'new-password-value' });

    expect(adminStats.status).toBe(200);
    expect(dpoStats.status).toBe(403);
    expect(statsSpy).toHaveBeenCalledTimes(1);
    expect(adminFlag.status).toBe(403);
    expect(superAdminFlag.status).toBe(200);
    expect(flagSpy).toHaveBeenCalledWith('super_admin-rotation-user');
    expect(ownChange.status).toBe(200);
    expect(changeSpy).toHaveBeenCalledWith({
      userId: 'dpo-rotation-user',
      oldPassword: 'old-password-value',
      newPassword: 'new-password-value',
    });
  });
});

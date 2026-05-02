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

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (fn: unknown) => dbTransactionMock(fn),
  },
}));

import * as passwordRotation from '../src/services/admin-password-rotation.service';
import { hashPassword, SCRYPT_N, HASH_VERSION } from '../src/services/auth.service';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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
  it('#12 — security.routes mounts the three new endpoints', () => {
    const ROUTE = readFileSync(
      resolve(__dirname, '../src/routes/security.routes.ts'),
      'utf8',
    );
    expect(ROUTE).toMatch(/router\.get\(\s*['"]\/admin\/legacy-password-stats['"]/);
    expect(ROUTE).toMatch(/router\.post\(\s*['"]\/admin\/flag-legacy-password-hashes['"]/);
    expect(ROUTE).toMatch(/router\.post\(\s*['"]\/admin\/me\/change-password['"]/);
    // Bulk-flag endpoint must be super_admin gated.
    expect(ROUTE).toMatch(/requireSuperAdmin/);
  });

  it('#12 — auth.routes admin login surfaces mustRotatePassword in both branches', () => {
    const ROUTE = readFileSync(
      resolve(__dirname, '../src/routes/auth.routes.ts'),
      'utf8',
    );
    // Password-only branch.
    expect(ROUTE).toMatch(/mustRotatePassword:\s*user\.must_rotate_password === true/);
    // Post-2FA branch.
    expect(ROUTE).toMatch(/mustRotatePassword:\s*fullUser\.rows\[0\]\?\.must_rotate_password === true/);
    // SELECT pulls the column.
    expect(ROUTE).toMatch(/COALESCE\(must_rotate_password, FALSE\) AS must_rotate_password/);
  });
});

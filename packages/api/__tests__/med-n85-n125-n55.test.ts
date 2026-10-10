// MED-N85 / MED-N125 / MED-N55 fixes verified.

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
jest.mock('../src/services/security.service', () => ({
  logSecurityEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingBoolean: jest.fn().mockResolvedValue(false),
}));

import { refreshAccessToken } from '../src/services/auth.service';
import { publishConsentVersion } from '../src/services/compliance-admin.service';
import { requestAccountDeletion } from '../src/services/data-management.service';
import jwt from 'jsonwebtoken';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  process.env.JWT_SECRET = 'test-secret-do-not-use-in-prod';
  dbTransactionMock.mockImplementation(async (cb: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (cb as any)({
      query: (sql: string, params?: unknown[]) => sql === 'SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE'
        ? Promise.resolve({ rows: [{ id: params?.[0] }], rowCount: 1 })
        : dbQueryMock(sql, params),
    });
  });
});

describe('MED-N85 — refresh token device fingerprint binding', () => {
  function makeRefreshToken(): string {
    return jwt.sign(
      { userId: 'u1', role: 'customer', type: 'refresh' },
      'test-secret-do-not-use-in-prod',
      { algorithm: 'HS256', expiresIn: 3600 },
    );
  }

  function userRow(): Record<string, unknown> {
    return {
      id: 'u1', phone: '+639170000000', email: null, first_name: 'A', last_name: 'B',
      role: 'customer', avatar_url: null, is_verified: true, is_active: true,
      last_login_at: null, created_at: new Date(), updated_at: new Date(),
    };
  }

  it('MED-N85 — INSERT new refresh_tokens row carries the incoming device_fingerprint + ip', async () => {
    const oldRefresh = makeRefreshToken();
    // SELECT FOR UPDATE returns existing row WITHOUT a stored fingerprint.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rt-1', user_id: 'u1', token_hash: 'whatever',
        expires_at: new Date(Date.now() + 3600000), created_at: new Date(),
        device_fingerprint: null, created_ip: null,
      }],
      rowCount: 1,
    });
    // SELECT users.
    dbQueryMock.mockResolvedValueOnce({ rows: [userRow()], rowCount: 1 });
    // DELETE old.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT new.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await refreshAccessToken(oldRefresh, {
      deviceFingerprint: 'fp-incoming-abc',
      ipAddress: '1.2.3.4',
    });

    const insertCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO refresh_tokens/.test(sql as string),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![0]).toMatch(/device_fingerprint/);
    expect(insertCall![0]).toMatch(/created_ip/);
    const params = insertCall![1] as unknown[];
    expect(params[3]).toBe('fp-incoming-abc');
    expect(params[4]).toBe('1.2.3.4');
  });

  it('MED-N85 — fingerprint mismatch logs security_event but does NOT reject in observe-only mode', async () => {
    const oldRefresh = makeRefreshToken();
    // Stored fingerprint is fp-stored-zzz.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rt-1', user_id: 'u1', token_hash: 'h',
        expires_at: new Date(Date.now() + 3600000), created_at: new Date(),
        device_fingerprint: 'fp-stored-zzz', created_ip: '5.5.5.5',
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [userRow()], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT

    const out = await refreshAccessToken(oldRefresh, {
      deviceFingerprint: 'fp-incoming-different',
      ipAddress: '9.9.9.9',
    });

    // Observe-only mode (settings.getSettingBoolean returns false) ->
    // refresh succeeds, mismatch is logged.
    expect(out.accessToken).toBeTruthy();

    // The mock for logSecurityEvent must have been called.

    const { logSecurityEvent } = require('../src/services/security.service');
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        eventType: 'refresh_token_fingerprint_mismatch',
        deviceFingerprint: 'fp-incoming-different',
      }),
    );
  });

  it('MED-N85 — fingerprint mismatch IN STRICT MODE rejects the refresh', async () => {
    // Flip strict mode on for this test only.

    const settings = require('../src/services/settings.service');
    settings.getSettingBoolean.mockResolvedValueOnce(true);

    const oldRefresh = makeRefreshToken();
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rt-1', user_id: 'u1', token_hash: 'h',
        expires_at: new Date(Date.now() + 3600000), created_at: new Date(),
        device_fingerprint: 'fp-stored', created_ip: null,
      }],
      rowCount: 1,
    });

    await expect(
      refreshAccessToken(oldRefresh, {
        deviceFingerprint: 'fp-different',
        ipAddress: '1.1.1.1',
      }),
    ).rejects.toThrow(/does not match the device/);
  });

  it('MED-N85 — no incoming fingerprint = back-compat (no comparison, refresh proceeds)', async () => {
    const oldRefresh = makeRefreshToken();
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'rt-1', user_id: 'u1', token_hash: 'h',
        expires_at: new Date(Date.now() + 3600000), created_at: new Date(),
        device_fingerprint: 'fp-stored', created_ip: null,
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [userRow()], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const out = await refreshAccessToken(oldRefresh); // no context

    expect(out.accessToken).toBeTruthy();
    // The new INSERT must carry the STORED fingerprint forward (so we
    // don't lose the binding).
    const insertCall = dbQueryMock.mock.calls.find(
      ([sql]) => /INSERT INTO refresh_tokens/.test(sql as string),
    );
    expect((insertCall![1] as unknown[])[3]).toBe('fp-stored');
  });
});

describe('MED-N125 — publishConsentVersion translates 23505 race to 409', () => {
  it('MED-N125 — surfaces 409 when concurrent insert hits the partial unique index', async () => {
    // Pre-check returns no existing.
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // INSERT throws 23505 (race winner already wrote).
    const pgErr = Object.assign(new Error('duplicate key'), { code: '23505' });
    dbQueryMock.mockRejectedValueOnce(pgErr);

    await expect(
      publishConsentVersion({
        adminUserId: 'admin-1',
        consentType: 'marketing_consent',
        version: '2.0.0',
        effectiveAt: new Date().toISOString(),
        changeSummary: 'Reworded data-use clause for clarity',
      }),
    ).rejects.toThrow(/already been published/);
  });

  it('MED-N125 — non-23505 errors propagate unchanged', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    dbQueryMock.mockRejectedValueOnce(new Error('connection terminated'));

    await expect(
      publishConsentVersion({
        adminUserId: 'admin-1',
        consentType: 'marketing_consent',
        version: '2.0.0',
        effectiveAt: new Date().toISOString(),
        changeSummary: 'Reworded data-use clause for clarity',
      }),
    ).rejects.toThrow(/connection terminated/);
  });
});

describe('MED-N55 — account deletion in-progress error is specific', () => {
  it('MED-N55 — when ALL blockers are in_progress the error tells the user to retry after auto-complete', async () => {
    // existing pending count = 0
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    // blocking bookings — both in_progress
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { id: 'b1', status: 'in_progress', scheduled_at: new Date() },
        { id: 'b2', status: 'completed_by_provider', scheduled_at: new Date() },
      ],
      rowCount: 2,
    });

    await expect(requestAccountDeletion('u1')).rejects.toThrow(/auto-complete soon/);
  });

  it('MED-N55 — when at least one blocker is cancellable, original error is shown', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({
      rows: [
        { id: 'b1', status: 'pending', scheduled_at: new Date() },
        { id: 'b2', status: 'in_progress', scheduled_at: new Date() },
      ],
      rowCount: 2,
    });

    await expect(requestAccountDeletion('u1')).rejects.toThrow(/complete or cancel them first/);
  });
});

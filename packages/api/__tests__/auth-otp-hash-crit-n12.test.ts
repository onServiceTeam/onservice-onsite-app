// CRIT-N12 fix verified — OTP codes are stored as scrypt hashes, not
// plaintext. Phone number is mixed into the hash input as a secondary
// salt; verify uses crypto.timingSafeEqual.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

const sendOtpSmsMock = jest.fn();
jest.mock('../src/services/sms.service', () => ({
  sendOtpSms: (...args: unknown[]) => sendOtpSmsMock(...args),
  sendSms: jest.fn(),
}));
jest.mock('../src/services/settings.service', () => ({
  getOtpPolicy: jest.fn().mockResolvedValue({
    length: 6,
    expiryMinutes: 5,
    maxAttempts: 3,
    cooldownSeconds: 60,
  }),
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { sendOtp, verifyOtp } from '../src/services/auth.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  sendOtpSmsMock.mockReset();
  sendOtpSmsMock.mockResolvedValue(true);
  process.env.JWT_SECRET = 'test-secret';
});

describe('CRIT-N12 — OTP codes are stored as hashes, not plaintext', () => {
  it('CRIT-N12 — sendOtp INSERT writes code_hash, not plaintext code', async () => {
    // 1. cooldown check (no prior in-flight)
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // 2. hourly limit check
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    await sendOtp('+639171234567');

    // Find the INSERT into otp_codes.
    const insertCall = txCalls.find((c) => /INSERT INTO otp_codes/.test(c.sql));
    expect(insertCall).toBeDefined();

    // Must use the code_hash column, NOT the legacy plaintext code column.
    expect(insertCall!.sql).toMatch(/code_hash/);
    expect(insertCall!.sql).not.toMatch(/INSERT INTO otp_codes \(phone, code,/);

    // Param 1 is phone, param 2 is the hash. The hash must follow the
    // documented format scrypt:N:r:p:salt:hash and NOT be a 6-digit
    // plaintext OTP.
    const phone = insertCall!.params[0];
    const hash = insertCall!.params[1] as string;
    expect(phone).toBe('+639171234567');
    expect(hash).toMatch(/^scrypt:\d+:\d+:\d+:[0-9a-f]+:[0-9a-f]+$/);
    expect(hash).not.toMatch(/^\d{6}$/);
  });

  it('CRIT-N12 — sendOtp invalidates prior + INSERTs new in single transaction', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // cooldown
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 }); // hourly

    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    await sendOtp('+639171234567');

    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    // First trx call: invalidate prior. Second: INSERT.
    expect(txCalls).toHaveLength(2);
    expect(txCalls[0]!.sql).toMatch(/UPDATE otp_codes SET is_used = TRUE/);
    expect(txCalls[1]!.sql).toMatch(/INSERT INTO otp_codes/);
  });

  it('CRIT-N12 — verifyOtp accepts a code that hashes to the stored code_hash', async () => {
    // Flow: send a valid OTP first to get the actual code → use it in
    // verify. We capture the OTP via the SMS mock.
    let sentOtp = '';
    sendOtpSmsMock.mockImplementationOnce(async (_phone: string, code: string) => {
      sentOtp = code;
      return true;
    });

    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

    let storedHash = '';
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        if (/INSERT INTO otp_codes/.test(sql)) {
          storedHash = params[1] as string;
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    await sendOtp('+639171234567');
    expect(sentOtp).toMatch(/^\d{6}$/);
    expect(storedHash).toMatch(/^scrypt:/);

    // Now verify the same OTP — should succeed. §34.2: the OTP SELECT (now
    // FOR UPDATE) + consume happen inside db.transaction.
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, _params: unknown[] = []) => {
        if (/SELECT \* FROM otp_codes/.test(sql)) {
          return {
            rows: [{
              id: 'otp-1',
              phone: '+639171234567',
              code: null,             // new-format row: plaintext is null
              code_hash: storedHash,
              attempts: 0,
              is_used: false,
              expires_at: new Date(Date.now() + 5 * 60 * 1000),
              created_at: new Date(),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 }; // mark used
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });
    // SELECT users → existing user found
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-1',
        phone: '+639171234567',
        email: null,
        first_name: 'Test',
        last_name: 'User',
        role: 'customer',
        avatar_url: null,
        is_verified: true,
        is_active: true,
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    });
    // UPDATE users
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // INSERT refresh_tokens
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await verifyOtp('+639171234567', sentOtp);
    expect(result.user.id).toBe('user-1');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('CRIT-N12 — verifyOtp REJECTS a wrong code (hash mismatch)', async () => {
    // Pre-store a known-good hash for OTP "111111"; user submits "222222".
    let storedHash = '';
    sendOtpSmsMock.mockImplementationOnce(async () => true);
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    dbQueryMock.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        if (/INSERT INTO otp_codes/.test(sql)) {
          storedHash = params[1] as string;
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });
    await sendOtp('+639171234567');

    // Force the SELECT to return the row with the hash from the send above.
    // §34.2: SELECT FOR UPDATE + attempts-increment run inside db.transaction.
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, _params: unknown[] = []) => {
        if (/SELECT \* FROM otp_codes/.test(sql)) {
          return {
            rows: [{
              id: 'otp-1',
              phone: '+639171234567',
              code: null,
              code_hash: storedHash,
              attempts: 0,
              is_used: false,
              expires_at: new Date(Date.now() + 5 * 60 * 1000),
              created_at: new Date(),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 }; // increment attempts
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    // Attempt to verify with WRONG code.
    await expect(
      verifyOtp('+639171234567', '999999'),
    ).rejects.toThrow(/Invalid code/);
  });

  it('CRIT-N12 — verifyOtp legacy fallback: still verifies plaintext code rows during rollout', async () => {
    // Simulate a legacy row (mid-rollout) with plaintext `code` populated
    // and `code_hash` null. The new verify path falls back to a
    // timing-safe plaintext compare. §34.2: consume runs in a transaction.
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, _params: unknown[] = []) => {
        if (/SELECT \* FROM otp_codes/.test(sql)) {
          return {
            rows: [{
              id: 'otp-legacy-1',
              phone: '+639171234567',
              code: '111111',
              code_hash: null,
              attempts: 0,
              is_used: false,
              expires_at: new Date(Date.now() + 5 * 60 * 1000),
              created_at: new Date(),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 }; // mark used
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-1',
        phone: '+639171234567',
        email: null,
        first_name: 'Test',
        last_name: 'User',
        role: 'customer',
        avatar_url: null,
        is_verified: true,
        is_active: true,
        last_login_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await verifyOtp('+639171234567', '111111');
    expect(result.user.id).toBe('user-1');
  });

  it('§34.2 — verifyOtp claims the OTP row with SELECT ... FOR UPDATE inside a transaction', async () => {
    let selectSql = '';
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, _params: unknown[] = []) => {
        if (/SELECT \* FROM otp_codes/.test(sql)) {
          selectSql = sql;
          return {
            rows: [{
              id: 'otp-1', phone: '+639171234567', code: '111111', code_hash: null,
              attempts: 0, is_used: false,
              expires_at: new Date(Date.now() + 5 * 60 * 1000), created_at: new Date(),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'user-1', phone: '+639171234567', email: null, first_name: 'T', last_name: 'U',
        role: 'customer', avatar_url: null, is_verified: true, is_active: true,
        last_login_at: null, created_at: new Date(), updated_at: new Date(),
      }],
      rowCount: 1,
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await verifyOtp('+639171234567', '111111');
    // The serialization guarantee: the row is locked FOR UPDATE so a
    // concurrent verify blocks until this one commits.
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(selectSql).toMatch(/FOR UPDATE/);
  });

  it('§34.2 — a second concurrent verify sees the row already consumed and is rejected', async () => {
    // Models the loser of the race: after the winner committed is_used=TRUE,
    // the FOR UPDATE SELECT (which filters is_used=FALSE) returns no row.
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (_sql: string, _params: unknown[] = []) => {
        return { rows: [], rowCount: 0 }; // row gone — already consumed
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    await expect(verifyOtp('+639171234567', '111111')).rejects.toThrow(/No valid verification code/);
    // No token issuance happened — the loser never reached the user lookup.
    expect(dbQueryMock).not.toHaveBeenCalled();
  });
});

// Phase 200 — dev/demo OTP bypass.
//
// Local testing can't receive an SMS and the OTP is stored only as a scrypt
// hash, so verifyOtp accepts a fixed DEV_OTP_CODE (default "000000") — but
// ONLY when NOT in production AND ALLOW_DEV_OTP=1. These tests prove the
// bypass works when gated on, is off by default, and is impossible in prod.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/services/sms.service', () => ({
  sendOtpSms: jest.fn().mockResolvedValue(true),
  sendSms: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { verifyOtp } from '../src/services/auth.service';

const PHONE = '+639171234567';

function mockUserLookupAndTokenIssue(): void {
  // After a successful (or bypassed) OTP check, verifyOtp does:
  //   SELECT users → UPDATE users (last_login) → INSERT refresh_tokens
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: 'user-1', phone: PHONE, email: null, first_name: 'Test', last_name: 'User',
      role: 'customer', avatar_url: null, is_verified: true, is_active: true,
      last_login_at: null, created_at: new Date(), updated_at: new Date(),
    }],
    rowCount: 1,
  });
  dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE users
  dbQueryMock.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT refresh_tokens
}

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_ALLOW = process.env.ALLOW_DEV_OTP;

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  process.env.JWT_SECRET = 'test-secret';
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_ALLOW === undefined) delete process.env.ALLOW_DEV_OTP;
  else process.env.ALLOW_DEV_OTP = ORIGINAL_ALLOW;
  delete process.env.DEV_OTP_CODE;
});

describe('Phase 200 — dev OTP bypass', () => {
  it('accepts the dev code WITHOUT any otp_codes row when enabled (non-prod + flag)', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_OTP = '1';
    // No otp_codes SELECT is mocked — if the code path tried to look one up,
    // the mock would return undefined and the call would throw. It must not.
    mockUserLookupAndTokenIssue();

    const result = await verifyOtp(PHONE, '000000');
    expect(result.user.id).toBe('user-1');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('respects a custom DEV_OTP_CODE', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_OTP = '1';
    process.env.DEV_OTP_CODE = '424242';
    mockUserLookupAndTokenIssue();

    const result = await verifyOtp(PHONE, '424242');
    expect(result.accessToken).toBeTruthy();
  });

  it('is OFF by default — without ALLOW_DEV_OTP the dev code falls through to real verification', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.ALLOW_DEV_OTP;
    // Falls through to the otp_codes lookup (now a FOR UPDATE inside a
    // transaction, §34.2), which finds nothing → rejects.
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async () => ({ rows: [], rowCount: 0 }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    await expect(verifyOtp(PHONE, '000000')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('can NEVER fire in production even if ALLOW_DEV_OTP=1 is mis-set', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEV_OTP = '1';
    // Production must ignore the bypass entirely and do the real lookup
    // (FOR UPDATE inside a transaction, §34.2).
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async () => ({ rows: [], rowCount: 0 }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (cb as any)({ query: clientQuery });
    });

    await expect(verifyOtp(PHONE, '000000')).rejects.toMatchObject({ statusCode: 400 });
  });
});

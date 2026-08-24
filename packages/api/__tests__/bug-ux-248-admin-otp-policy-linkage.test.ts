const mockDbQuery = jest.fn();
const mockTransaction = jest.fn();
const mockSendOtpSms = jest.fn().mockResolvedValue(true);

jest.mock('../src/config/redis.config', () => ({
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  },
}));
jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (callback: unknown) => mockTransaction(callback),
  },
}));
jest.mock('../src/services/sms.service', () => ({
  sendOtpSms: (...args: unknown[]) => mockSendOtpSms(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { sendOtp, verifyOtp } from '../src/services/auth.service';
import { verifyOtpSchema } from '../src/validators/auth.validators';

it('Bug UX-248 — admin OTP policy controls API generation, cooldown, expiry, SMS copy, and accepted code length', async () => {
  const settingValues: Record<string, string> = {
    otp_length: '8',
    otp_expiry_minutes: '7',
    otp_max_attempts: '5',
    otp_cooldown_seconds: '45',
  };
  mockDbQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM platform_settings')) {
      return { rows: [{ value: settingValues[String(params?.[0])] }], rowCount: 1 };
    }
    if (sql.includes('SELECT id FROM otp_codes')) return { rows: [], rowCount: 0 };
    if (sql.includes('COUNT(*)::text')) return { rows: [{ count: '0' }], rowCount: 1 };
    throw new Error(`Unexpected query: ${sql}`);
  });
  let insertedExpiry: Date | null = null;
  let insertedHash = '';
  mockTransaction.mockImplementationOnce(async (callback: unknown) => {
    const client = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO otp_codes')) {
          insertedHash = params?.[1] as string;
          insertedExpiry = params?.[2] as Date;
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    return (callback as (value: typeof client) => Promise<unknown>)(client);
  });
  const before = Date.now();

  await sendOtp('+639171234567');

  const generatedCode = mockSendOtpSms.mock.calls[0]?.[1] as string;
  expect(generatedCode).toMatch(/^\d{8}$/);
  expect(mockSendOtpSms).toHaveBeenCalledWith('+639171234567', generatedCode, 7);
  expect(verifyOtpSchema.safeParse({ phone: '+639171234567', code: generatedCode }).success).toBe(true);
  expect(mockDbQuery.mock.calls.some(([, params]) => (
    Array.isArray(params) && params[0] === '+639171234567' && params[1] === 45
  ))).toBe(true);
  expect(insertedExpiry).not.toBeNull();
  expect(insertedExpiry!.getTime()).toBeGreaterThanOrEqual(before + (7 * 60 * 1000) - 1000);

  mockTransaction.mockImplementationOnce(async (callback: unknown) => {
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT * FROM otp_codes')) {
          return {
            rows: [{
              id: 'otp-1',
              phone: '+639171234567',
              code: null,
              code_hash: insertedHash,
              attempts: 3,
              is_used: false,
              expires_at: insertedExpiry,
              created_at: new Date(),
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    return (callback as (value: typeof client) => Promise<unknown>)(client);
  });
  const wrongCode = generatedCode === '00000000' ? '11111111' : '00000000';
  await expect(verifyOtp('+639171234567', wrongCode)).rejects.toThrow('1 attempt remaining');
});

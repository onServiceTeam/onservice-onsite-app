/** Actual token issuance and cryptographic expiry, with only persistence mocked. */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const mockQuery = jest.fn();
jest.mock('../src/models/db', () => ({ db: {
  query: (...args: unknown[]) => mockQuery(...args),
  transaction: async (work: Parameters<typeof import('../src/models/db').db.transaction>[0]) =>
    work({ query: mockQuery }),
} }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createTokenPair } from '../src/services/auth.service';

const secret = 'synthetic-smoke-token-secret-never-a-live-credential';
const nowSeconds = 1_800_000_000;
const envKeys = ['JWT_SECRET', 'JWT_ACCESS_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN'] as const;
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  mockQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 1 });
  process.env.JWT_SECRET = secret;
  delete process.env.JWT_ACCESS_EXPIRES_IN;
  delete process.env.JWT_REFRESH_EXPIRES_IN;
  jest.spyOn(Date, 'now').mockReturnValue(nowSeconds * 1000);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of envKeys) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

async function assertIssuedLifetimes(role: string, accessSeconds: number, refreshSeconds: number): Promise<void> {
  const userId = '11111111-1111-4111-8111-111111111111';
  mockQuery.mockResolvedValueOnce({ rows: [{ role, is_active: true, session_version: 7 }] });
  const pair = await createTokenPair(userId, role, 7);
  for (const [token, seconds, refresh] of [
    [pair.accessToken, accessSeconds, false],
    [pair.refreshToken, refreshSeconds, true],
  ] as const) {
    const claims = jwt.verify(token, secret, {
      algorithms: ['HS256'], clockTimestamp: nowSeconds + seconds - 1,
    }) as jwt.JwtPayload;
    expect(claims).toMatchObject({ userId, role, sessionVersion: 7, iat: nowSeconds, exp: nowSeconds + seconds });
    if (refresh) {
      expect(claims.type).toBe('refresh');
      expect(claims.jti).toEqual(expect.any(String));
    } else expect(claims.type).toBeUndefined();
    expect(() => jwt.verify(token, secret, {
      algorithms: ['HS256'], clockTimestamp: nowSeconds + seconds,
    })).toThrow(jwt.TokenExpiredError);
  }
  expect(mockQuery).toHaveBeenCalledTimes(2);
  // Assert values actually sent by the service, not a source-text match.
  expect(mockQuery.mock.calls[1]![1]).toEqual([
    userId,
    crypto.createHash('sha256').update(pair.refreshToken).digest('hex'),
    new Date((nowSeconds + refreshSeconds) * 1000),
  ]);
}

it.each(['customer', 'provider', 'provider_staff'])('%s receives 15-minute access and 30-day refresh by default', async (role) => {
  await assertIssuedLifetimes(role, 900, 2_592_000);
});

it.each(['admin', 'super_admin', 'dpo'])('%s receives 15-minute access and an 8-hour refresh, not 30 days', async (role) => {
  await assertIssuedLifetimes(role, 900, 28_800);
});

it.each(['customer', 'provider', 'provider_staff', 'admin', 'super_admin', 'dpo'])('%s honors access overrides without extending privileged refresh lifetimes', async (role) => {
  process.env.JWT_ACCESS_EXPIRES_IN = '2m';
  process.env.JWT_REFRESH_EXPIRES_IN = '2d';
  const adminTier = ['admin', 'super_admin', 'dpo'].includes(role);
  await assertIssuedLifetimes(role, 120, adminTier ? 28_800 : 172_800);
});

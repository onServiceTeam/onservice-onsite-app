import jwt from 'jsonwebtoken';
import { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: jest.fn(),
}));
jest.mock('../src/config/redis.config', () => ({
  redis: { call: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { globalRateLimitKey } from '../src/middleware/rate-limit.middleware';

it('Bug SEC-032 — global rate limiting separates server-signed user credentials while forgeries remain IP-scoped', () => {
  const previousSecret = process.env.JWT_SECRET;
  const secret = 'sec-032-rate-limit-identity-secret';
  process.env.JWT_SECRET = secret;
  const userId = '10000000-0000-4000-8000-000000000032';
  const otherUserId = '20000000-0000-4000-8000-000000000032';
  const accessToken = jwt.sign(
    { userId, role: 'customer', sessionVersion: 1 },
    secret,
    { algorithm: 'HS256', expiresIn: '15m' },
  );
  const expiredAccessToken = jwt.sign(
    { userId, role: 'customer', sessionVersion: 1 },
    secret,
    { algorithm: 'HS256', expiresIn: -1 },
  );
  const refreshToken = jwt.sign(
    { userId: otherUserId, role: 'provider', sessionVersion: 1, type: 'refresh' },
    secret,
    { algorithm: 'HS256', expiresIn: '30d' },
  );
  const ipAddress = '203.0.113.32';
  const requestFor = (input: Partial<Request>): Request => ({
    headers: {}, body: {}, cookies: {}, ip: ipAddress,
    socket: { remoteAddress: ipAddress },
    ...input,
  } as unknown as Request);

  try {
    expect(globalRateLimitKey(requestFor({
      headers: { authorization: `Bearer ${accessToken}` },
    }))).toBe(`u:${userId}`);
    expect(globalRateLimitKey(requestFor({
      cookies: { admin_session: accessToken },
    }))).toBe(`u:${userId}`);
    expect(globalRateLimitKey(requestFor({
      body: { refreshToken },
    }))).toBe(`u:${otherUserId}`);
    expect(globalRateLimitKey(requestFor({
      headers: { authorization: `Bearer ${expiredAccessToken}` },
    }))).toBe(ipKeyGenerator(ipAddress));
    expect(globalRateLimitKey(requestFor({
      headers: { authorization: 'Bearer forged.token.value' },
    }))).toBe(ipKeyGenerator(ipAddress));
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

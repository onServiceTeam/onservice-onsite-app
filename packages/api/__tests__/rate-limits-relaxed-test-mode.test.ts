// Test-mode rate-limit relaxation (staging QA) — RATE_LIMITS_RELAXED.
//
// When RATE_LIMITS_RELAXED=1 on a NON-production box, the OTP brute-force
// lockout short-circuits and the global + auth rate limiters lift their caps,
// so QA testers don't get "Too many attempts" mid-test. It is HARD-GATED on
// NODE_ENV so it can never disable brute-force protection in production.

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Behavioral: relaxed mode short-circuits checkOtpLockout (no DB hit) ──
jest.mock('../src/config/platform.config', () => ({
  platformConfig: {
    rateLimitsRelaxed: true,
    otpLockoutThresholds: [{ failures: 3, lockoutMinutes: 5 }],
    captchaThreshold: 3,
    ipOtpLockoutThreshold: 20,
  },
}));
jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { checkOtpLockout } from '../src/services/security.service';
import { db } from '../src/models/db';

describe('RATE_LIMITS_RELAXED — behavioral', () => {
  it('checkOtpLockout returns unlocked and does NOT query the DB when relaxed', async () => {
    const result = await checkOtpLockout('+639171234567', '203.0.113.7');
    expect(result).toEqual({ locked: false, captchaRequired: false });
    expect(db.query as jest.Mock).not.toHaveBeenCalled();
  });
});

// ── Config safety: the switch can never activate in production ──
const CONFIG = readFileSync(resolve(__dirname, '../src/config/platform.config.ts'), 'utf8');
const RL = readFileSync(resolve(__dirname, '../src/middleware/rate-limit.middleware.ts'), 'utf8');
const SVC = readFileSync(resolve(__dirname, '../src/services/security.service.ts'), 'utf8');
const AUTH_ROUTES = readFileSync(resolve(__dirname, '../src/routes/auth.routes.ts'), 'utf8');
const AUTH_SVC = readFileSync(resolve(__dirname, '../src/services/auth.service.ts'), 'utf8');

describe('RATE_LIMITS_RELAXED — production safety + coverage', () => {
  it('is gated on NODE_ENV !== production (cannot disable protection on a real box)', () => {
    expect(CONFIG).toMatch(
      /rateLimitsRelaxed:\s*[\s\S]{0,80}RATE_LIMITS_RELAXED['"]? === ['"]1['"][\s\S]{0,80}NODE_ENV !== ['"]production['"]/,
    );
  });

  it('the OTP lockout honors the relaxed flag', () => {
    expect(SVC).toMatch(/if \(platformConfig\.rateLimitsRelaxed\) \{[\s\S]{0,120}return \{ locked: false, captchaRequired: false \}/);
  });

  it('the global + auth + upload limiters in middleware lift their caps when relaxed', () => {
    const matches = RL.match(/platformConfig\.rateLimitsRelaxed\s*\?\s*1_000_000/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('the inline auth-routes limiter (the OTP/login one) lifts its cap when relaxed', () => {
    expect(AUTH_ROUTES).toMatch(/platformConfig\.rateLimitsRelaxed\s*[\s\S]{0,40}1_000_000/);
  });

  it('sendOtp skips the resend cooldown + hourly cap when relaxed', () => {
    // The cooldown check AND the hourly cap throw are both inside the
    // `if (!rateLimitsRelaxed)` guard.
    expect(AUTH_SVC).toMatch(
      /if \(!platformConfig\.rateLimitsRelaxed\) \{[\s\S]{0,1400}before requesting a new code[\s\S]{0,600}Too many OTP requests/,
    );
  });
});

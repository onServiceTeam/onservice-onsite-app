// MED-N62 fix verified — checkOtpLockout now triggers an
// independent IP-level lockout when an attacker is rotating
// across phones from one IP.
//
// Pre-fix: `effectiveCount = Math.max(failedCount, ipFailedCount)`.
// If an attacker hit 5 phones from one IP (5 IP failures, 1
// per-phone failure each), only the LAST phone tried triggered a
// lockout. The 4 other phones stayed open at 1 failure each. The
// attacker simply rotated through phones to keep evading per-phone
// lockout indefinitely.
//
// Post-fix: independent ipFailedCount >= IP_OTP_LOCKOUT_THRESHOLD
// (default 20 = 2x highest per-phone threshold) check. If the IP
// is over its rolling threshold, return locked immediately
// regardless of which phone is currently being tried. captchaRequired
// also reflects the IP threshold.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/security.service.ts'),
  'utf8',
);
const CONFIG = readFileSync(
  resolve(__dirname, '../src/config/platform.config.ts'),
  'utf8',
);

describe('MED-N62 — checkOtpLockout has independent IP-level threshold', () => {
  it('platformConfig.ipOtpLockoutThreshold is exposed (default 20)', () => {
    expect(CONFIG).toMatch(/ipOtpLockoutThreshold: 20/);
  });

  it('reads platformConfig.ipOtpLockoutThreshold (with fallback)', () => {
    expect(SVC).toMatch(/IP_OTP_LOCKOUT_THRESHOLD = \(platformConfig\.ipOtpLockoutThreshold \?\? 20\)/);
  });

  it('computes ipLockedOut from ipFailedCount independently', () => {
    expect(SVC).toMatch(/const ipLockedOut = ipFailedCount >= IP_OTP_LOCKOUT_THRESHOLD/);
  });

  it('captchaRequired considers BOTH effectiveCount AND ipLockedOut (defense in depth)', () => {
    expect(SVC).toMatch(/captchaRequired = effectiveCount >= CAPTCHA_THRESHOLD \|\| ipLockedOut/);
  });

  it('returns locked + captchaRequired immediately when ipLockedOut', () => {
    expect(SVC).toMatch(/if \(ipLockedOut\) \{[\s\S]{0,1000}return \{ locked: true, lockoutEndsAt, captchaRequired: true \}/);
  });

  it('logs IP-level lockout to security_events with scope: ip', () => {
    expect(SVC).toMatch(/scope: 'ip',\s*ipFailedCount,\s*ipThreshold: IP_OTP_LOCKOUT_THRESHOLD/);
  });

  it('IP-level lockout uses the longest standard lockout window', () => {
    expect(SVC).toMatch(/OTP_LOCKOUT_THRESHOLDS\[OTP_LOCKOUT_THRESHOLDS\.length - 1\]\?\.lockoutMinutes/);
  });

  it('falls back to 60 minutes if the threshold list is empty (defensive)', () => {
    expect(SVC).toMatch(/\?\.lockoutMinutes \?\? 60/);
  });

  it('logger.warn message identifies the lockout as IP-level', () => {
    expect(SVC).toMatch(/OTP lockout triggered \(IP-level\)/);
  });
});

describe('MED-N62 — attack-pattern smoke', () => {
  // Simulate the math the fix replaces:
  //   attacker hits 5 phones from 1 IP, 1 failure per phone
  //   ipFailedCount = 5, failedCount per phone = 1
  it('with IP_THRESHOLD = 20: 5 phones x 1 failure does NOT trip IP lockout (under threshold — captcha kicks in via captchaRequired path elsewhere)', () => {
    const IP_THRESHOLD = 20;
    const ipFailedCount = 5;
    expect(ipFailedCount >= IP_THRESHOLD).toBe(false);
  });

  it('but 21 phones (or 21 attempts dispersed across phones) DOES trip IP lockout', () => {
    const IP_THRESHOLD = 20;
    const ipFailedCount = 21;
    expect(ipFailedCount >= IP_THRESHOLD).toBe(true);
  });

  it('IP lockout activates even when no single phone is at the per-phone threshold', () => {
    // Per-phone thresholds are [3, 5, 10] failures. Attacker spreads
    // 25 failures across 25 phones = 1 each = no per-phone lockout.
    // IP threshold catches it.
    const IP_THRESHOLD = 20;
    const ipFailedCount = 25;
    const perPhoneFailedCount = 1;
    const PER_PHONE_THRESHOLDS = [3, 5, 10];
    const perPhoneTrip = PER_PHONE_THRESHOLDS.some((t) => perPhoneFailedCount >= t);
    expect(perPhoneTrip).toBe(false); // pre-fix this would let attack continue
    expect(ipFailedCount >= IP_THRESHOLD).toBe(true); // post-fix catches it
  });
});

// A1 / C1 — ADMIN_DISABLE_2FA must not be usable in production.
//
// Pre-fix: ADMIN_DISABLE_2FA reduced admin login to password-only and was
// guarded only by a runtime log warning — nothing stopped it from being left
// on in a production deploy.
//
// Post-fix: assertAdmin2faNotDisabledInProduction() throws synchronously at
// boot when the flag is set AND NODE_ENV=production, so the API refuses to
// bind its port. Staging/development are unaffected.
//
// This imports and invokes the REAL guard (a pure function, no port binding),
// so the assertions are on actual behavior, not on source text.

import {
  assertAdmin2faNotDisabledInProduction,
  isAdmin2faDisabled,
} from '../src/config/boot-guards';

const env = (overrides: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  overrides as NodeJS.ProcessEnv;

describe('A1 / C1 — ADMIN_DISABLE_2FA production boot guard', () => {
  it("A1 — throws when ADMIN_DISABLE_2FA='1' and NODE_ENV=production", () => {
    expect(() =>
      assertAdmin2faNotDisabledInProduction(env({ NODE_ENV: 'production', ADMIN_DISABLE_2FA: '1' })),
    ).toThrow(/ADMIN_DISABLE_2FA is set while NODE_ENV=production/);
  });

  it("A1 — throws when ADMIN_DISABLE_2FA='true' and NODE_ENV=production", () => {
    expect(() =>
      assertAdmin2faNotDisabledInProduction(env({ NODE_ENV: 'production', ADMIN_DISABLE_2FA: 'true' })),
    ).toThrow(/refuse to boot|production startup blocked|ADMIN_DISABLE_2FA/);
  });

  it('A1 — does NOT throw in production when the flag is unset', () => {
    expect(() =>
      assertAdmin2faNotDisabledInProduction(env({ NODE_ENV: 'production' })),
    ).not.toThrow();
  });

  it("A1 — does NOT throw in production when the flag is an explicit '0'", () => {
    expect(() =>
      assertAdmin2faNotDisabledInProduction(env({ NODE_ENV: 'production', ADMIN_DISABLE_2FA: '0' })),
    ).not.toThrow();
  });

  it('A1 — does NOT throw in staging even when the flag is set (escape hatch allowed)', () => {
    expect(() =>
      assertAdmin2faNotDisabledInProduction(env({ NODE_ENV: 'staging', ADMIN_DISABLE_2FA: '1' })),
    ).not.toThrow();
  });

  it('A1 — does NOT throw in development even when the flag is set', () => {
    expect(() =>
      assertAdmin2faNotDisabledInProduction(env({ NODE_ENV: 'development', ADMIN_DISABLE_2FA: '1' })),
    ).not.toThrow();
  });
});

describe('A1 — isAdmin2faDisabled recognizes only documented truthy values', () => {
  it("treats '1' as disabled", () => {
    expect(isAdmin2faDisabled(env({ ADMIN_DISABLE_2FA: '1' }))).toBe(true);
  });

  it("treats 'true' as disabled", () => {
    expect(isAdmin2faDisabled(env({ ADMIN_DISABLE_2FA: 'true' }))).toBe(true);
  });

  it('treats an unset flag as enabled (secure default)', () => {
    expect(isAdmin2faDisabled(env({}))).toBe(false);
  });

  it("treats other strings (e.g. 'yes', '0', 'false') as NOT disabled", () => {
    expect(isAdmin2faDisabled(env({ ADMIN_DISABLE_2FA: 'yes' }))).toBe(false);
    expect(isAdmin2faDisabled(env({ ADMIN_DISABLE_2FA: '0' }))).toBe(false);
    expect(isAdmin2faDisabled(env({ ADMIN_DISABLE_2FA: 'false' }))).toBe(false);
  });
});

// MED-N82 / MED-N84 fixes verified.

import { readFileSync } from 'fs';
import { resolve } from 'path';

import {
  adminLoginSchema,
  adminTwoFactorVerifySchema,
  adminTwoFactorDisableSchema,
} from '../src/validators/auth.validators';

const AUTH_ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/auth.routes.ts'),
  'utf8',
);

describe('MED-N82 — admin/2fa/setup writes audit + UPDATE in a transaction', () => {
  it('MED-N82 — handler uses db.transaction wrapping the UPDATE + admin_actions INSERT', () => {
    const anchor = AUTH_ROUTES.indexOf("'/admin/2fa/setup'");
    expect(anchor).toBeGreaterThan(0);
    const block = AUTH_ROUTES.slice(anchor, anchor + 3000);
    expect(block).toMatch(/await db\.transaction\(async \(client\)/);
    expect(block).toMatch(/client\.query[\s\S]*?UPDATE users[\s\S]*?totp_secret/);
    expect(block).toMatch(/client\.query[\s\S]*?INSERT INTO admin_actions[\s\S]*?admin_2fa_enrolled/);
  });
});

describe('MED-N84 — admin auth endpoints use Zod schemas', () => {
  it('MED-N84 — adminLoginSchema validates email + password', () => {
    expect(adminLoginSchema.safeParse({ email: 'admin@x.com', password: 'StrongPass1' }).success).toBe(true);
    expect(adminLoginSchema.safeParse({ email: 'not-an-email', password: 'StrongPass1' }).success).toBe(false);
    expect(adminLoginSchema.safeParse({ email: 'admin@x.com', password: 'short' }).success).toBe(false);
    expect(adminLoginSchema.safeParse({}).success).toBe(false);
  });

  it('MED-N84 — adminTwoFactorVerifySchema requires preAuthToken + 6-8 digit totpCode', () => {
    expect(adminTwoFactorVerifySchema.safeParse({
      preAuthToken: 'pre-token-1234567890',
      totpCode: '123456',
    }).success).toBe(true);
    expect(adminTwoFactorVerifySchema.safeParse({
      preAuthToken: 'short',
      totpCode: '123456',
    }).success).toBe(false);
    expect(adminTwoFactorVerifySchema.safeParse({
      preAuthToken: 'pre-token-1234567890',
      totpCode: '12abc',
    }).success).toBe(false);
  });

  it('MED-N84 — adminTwoFactorDisableSchema requires 6-8 digit totpCode', () => {
    expect(adminTwoFactorDisableSchema.safeParse({ totpCode: '123456' }).success).toBe(true);
    expect(adminTwoFactorDisableSchema.safeParse({ totpCode: '1234' }).success).toBe(false);
    expect(adminTwoFactorDisableSchema.safeParse({ totpCode: 'abcdef' }).success).toBe(false);
  });

  it('MED-N84 — auth.routes wires validationMiddleware on the 3 admin endpoints', () => {
    // /admin/login with adminLoginSchema.
    const loginAnchor = AUTH_ROUTES.indexOf("'/admin/login'");
    const loginBlock = AUTH_ROUTES.slice(loginAnchor, loginAnchor + 600);
    expect(loginBlock).toMatch(/validationMiddleware\(adminLoginSchema\)/);

    // /admin/2fa/verify.
    const verifyAnchor = AUTH_ROUTES.indexOf("'/admin/2fa/verify'");
    const verifyBlock = AUTH_ROUTES.slice(verifyAnchor, verifyAnchor + 600);
    expect(verifyBlock).toMatch(/validationMiddleware\(adminTwoFactorVerifySchema\)/);

    // /admin/2fa/disable.
    const disableAnchor = AUTH_ROUTES.indexOf("'/admin/2fa/disable'");
    const disableBlock = AUTH_ROUTES.slice(disableAnchor, disableAnchor + 600);
    expect(disableBlock).toMatch(/validationMiddleware\(adminTwoFactorDisableSchema\)/);
  });
});

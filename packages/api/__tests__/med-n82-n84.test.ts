// MED-N82 / MED-N84 fixes verified.

import {
  enrollmentIt, enrollmentOwner, requestSetup, withEnrollmentDatabase,
} from './helpers/admin-enrollment-postgres';
import { decryptSecret } from '../src/utils/totp';
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
  enrollmentIt('MED-N82 — failed enrollment audit rolls back the actual key write and a later retry persists both', async () => {
    await withEnrollmentDatabase(async database => {
      const accounts = (await database.query('SELECT * FROM users')).rows;
      await database.query(`CREATE FUNCTION fail_enrollment_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'Synthetic enrollment audit failure'; END $$;
        CREATE TRIGGER fail_enrollment_audit BEFORE INSERT ON admin_actions
        FOR EACH ROW EXECUTE FUNCTION fail_enrollment_audit();`);
      const rejected = await requestSetup();
      expect(rejected.status).toBe(500);
      expect(rejected.body.data).toBeUndefined();
      expect(rejected.headers['set-cookie']).toBeUndefined();
      expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
      expect((await database.query('SELECT * FROM admin_actions')).rows).toEqual([]);
      await database.query('DROP TRIGGER fail_enrollment_audit ON admin_actions');
      const retry = await requestSetup();
      expect(retry.status).toBe(200);
      const row = (await database.query('SELECT totp_secret,totp_enabled FROM users')).rows[0];
      expect(row.totp_secret.startsWith('enc:')).toBe(true);
      expect(decryptSecret(row.totp_secret) === retry.body.data.secret).toBe(true);
      expect(row.totp_enabled).toBe(false);
      expect((await database.query('SELECT admin_id,action_type,target_type,target_id,details FROM admin_actions')).rows)
        .toEqual([{ admin_id: enrollmentOwner, action_type: 'admin_2fa_enrolled', target_type: 'user',
          target_id: enrollmentOwner, details: { phase: 'setup', enabled: false } }]);
    });
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

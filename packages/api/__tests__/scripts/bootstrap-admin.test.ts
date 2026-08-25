// Bug 1235 fix verified — Phase 14 Dispatch 01.
//
// The bootstrap-admin.ts script replaces the deleted seed
// `004_admin_passwords.sql` which shipped a placeholder hash inviting a
// well-meaning fix that would create a real admin account everyone knows.
//
// These tests cover the strength-validation logic and the role/email
// validation. They do NOT exercise the DB write path (that requires a live
// Postgres connection and is covered separately by integration tests).

import {
  passwordIsStrongEnough,
  emailLooksValid,
  roleIsAllowed,
} from '../../scripts/bootstrap-admin';

describe('bootstrap-admin (Bug 1235 — admin password seed deletion + CLI bootstrap)', () => {
  describe('passwordIsStrongEnough', () => {
    it('rejects passwords shorter than 16 chars', () => {
      const result = passwordIsStrongEnough('Sh0rt!Pass');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/16/);
    });

    it('rejects passwords missing uppercase', () => {
      const result = passwordIsStrongEnough('alllowercase123!@#');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/uppercase/);
    });

    it('rejects passwords missing lowercase', () => {
      const result = passwordIsStrongEnough('ALLUPPERCASE123!@#');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/lowercase/);
    });

    it('rejects passwords missing digits', () => {
      const result = passwordIsStrongEnough('NoDigitsHereJustAlpha!@#');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/digit/);
    });

    it('rejects passwords missing special characters', () => {
      const result = passwordIsStrongEnough('NoSpecialChars1234567');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/special/);
    });

    it('rejects banned dictionary words at start (case-insensitive)', () => {
      const banned = ['password1Strong!@', 'admin1Strong!@PWD', 'ONSERVICE1Strong!@', 'qwerty1Strong!@PW', '12345Strong!@PWord'];
      for (const pw of banned) {
        const result = passwordIsStrongEnough(pw);
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/dictionary/);
      }
    });

    it('rejects 5+ repeated characters in a row', () => {
      const result = passwordIsStrongEnough('GoodPwdaaaaaa1!Foo');
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/repeated/);
    });

    it('accepts a strong password', () => {
      const result = passwordIsStrongEnough('X9!nz2$LongAdminPwd');
      expect(result.ok).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('rejects empty password', () => {
      const result = passwordIsStrongEnough('');
      expect(result.ok).toBe(false);
    });
  });

  describe('emailLooksValid', () => {
    it('accepts standard emails', () => {
      expect(emailLooksValid('admin@onservice.ph')).toBe(true);
      expect(emailLooksValid('finance.lead+ops@onservice.com')).toBe(true);
    });

    it('rejects empty / undefined', () => {
      expect(emailLooksValid(undefined)).toBe(false);
      expect(emailLooksValid('')).toBe(false);
    });

    it('rejects malformed emails', () => {
      expect(emailLooksValid('admin')).toBe(false);
      expect(emailLooksValid('admin@')).toBe(false);
      expect(emailLooksValid('admin@onservice')).toBe(false);
      expect(emailLooksValid('@onservice.ph')).toBe(false);
      expect(emailLooksValid('admin onservice@ph')).toBe(false);
    });
  });

  describe('roleIsAllowed', () => {
    it('accepts only the 3 real admin-tier login roles', () => {
      expect(roleIsAllowed('super_admin')).toBe(true);
      expect(roleIsAllowed('admin')).toBe(true);
      expect(roleIsAllowed('dpo')).toBe(true);
    });

    it('rejects undocumented roles', () => {
      expect(roleIsAllowed('customer')).toBe(false);
      expect(roleIsAllowed('provider')).toBe(false);
      expect(roleIsAllowed('finance')).toBe(false);
      expect(roleIsAllowed('support')).toBe(false);
      expect(roleIsAllowed('dispatcher')).toBe(false);
      expect(roleIsAllowed('Super_Admin')).toBe(false); // case-sensitive
      expect(roleIsAllowed('')).toBe(false);
    });
  });
});

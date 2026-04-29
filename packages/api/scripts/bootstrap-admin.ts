// packages/api/scripts/bootstrap-admin.ts
//
// Bug 1235 (Phase 14 Dispatch 01) fix.
//
// Replaces the deleted seed `seeds/004_admin_passwords.sql` which shipped a
// placeholder hash inviting a "well-meaning fix" that would create a real
// admin account everyone knows the password to.
//
// Usage:
//   ADMIN_BOOTSTRAP_PASSWORD='<strong>' \
//   ADMIN_BOOTSTRAP_ROLE='super_admin' \
//   npx tsx packages/api/scripts/bootstrap-admin.ts <email>
//
// Refuses to run unless ADMIN_BOOTSTRAP_PASSWORD is set, length >= 16, and
// passes basic strength checks (contains digit, lowercase, uppercase, special,
// not a banned dictionary pattern).
//
// On success: creates or updates the user row by email with the hashed password
// and the requested role; first login enforces TOTP 2FA enrollment via the
// existing admin auth flow.

import { hashPassword } from '../src/services/auth.service';
import { db } from '../src/db';

const PWD = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const ROLE = (process.env.ADMIN_BOOTSTRAP_ROLE ?? 'super_admin').toLowerCase();
const email = process.argv[2];

const ALLOWED_ROLES = new Set([
  'super_admin',
  'admin',
  'dpo',
  'finance',
  'support',
  'dispatcher',
]);

interface StrengthResult {
  ok: boolean;
  reason?: string;
}

export function passwordIsStrongEnough(pw: string): StrengthResult {
  if (pw.length < 16) return { ok: false, reason: 'must be >= 16 chars' };
  if (!/[a-z]/.test(pw)) return { ok: false, reason: 'must contain a lowercase letter' };
  if (!/[A-Z]/.test(pw)) return { ok: false, reason: 'must contain an uppercase letter' };
  if (!/[0-9]/.test(pw)) return { ok: false, reason: 'must contain a digit' };
  // eslint-disable-next-line no-useless-escape
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw)) {
    return { ok: false, reason: 'must contain a special character' };
  }
  if (/^(password|admin|onservice|qwerty|12345)/i.test(pw)) {
    return { ok: false, reason: 'matches a banned dictionary pattern' };
  }
  if (/(.)\1{4,}/.test(pw)) {
    return { ok: false, reason: 'contains 5+ repeated characters in a row' };
  }
  return { ok: true };
}

export function emailLooksValid(s: string | undefined): s is string {
  if (!s) return false;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
}

export function roleIsAllowed(role: string): boolean {
  return ALLOWED_ROLES.has(role);
}

async function main(): Promise<void> {
  if (!PWD) {
    process.stderr.write(
      'FATAL: ADMIN_BOOTSTRAP_PASSWORD env var is required.\n' +
        'Refusing to seed admin without an explicit, strong password.\n',
    );
    process.exit(1);
  }
  if (!emailLooksValid(email)) {
    process.stderr.write(`FATAL: provide email as argv[2]. Got: ${email}\n`);
    process.exit(1);
  }
  if (!roleIsAllowed(ROLE)) {
    process.stderr.write(
      `FATAL: ADMIN_BOOTSTRAP_ROLE '${ROLE}' invalid. Allowed: ${Array.from(ALLOWED_ROLES).join(', ')}\n`,
    );
    process.exit(1);
  }
  const strength = passwordIsStrongEnough(PWD);
  if (!strength.ok) {
    process.stderr.write(`FATAL: password rejected — ${strength.reason}\n`);
    process.exit(1);
  }

  const hash = hashPassword(PWD);

  const existing = await db.query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE email = $1`,
    [email],
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    await db.query(
      `UPDATE users
       SET password_hash = $1,
           role = $2,
           is_active = true,
           is_verified = true,
           updated_at = NOW()
       WHERE id = $3`,
      [hash, ROLE, row.id],
    );
    process.stdout.write(`Updated password and role for existing user: ${email} (id=${row.id}, role=${ROLE})\n`);
  } else {
    await db.query(
      `INSERT INTO users (email, password_hash, role, is_active, is_verified, created_at, updated_at)
       VALUES ($1, $2, $3, true, true, NOW(), NOW())`,
      [email, hash, ROLE],
    );
    process.stdout.write(`Created ${ROLE} user: ${email}\n`);
  }

  process.stdout.write('Bootstrap complete. Sign in via /login with the provided password.\n');
  process.stdout.write('IMPORTANT: enroll TOTP 2FA on first login.\n');
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      process.stderr.write(`FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}

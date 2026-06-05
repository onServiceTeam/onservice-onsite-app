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
import { db } from '../src/models/db';

const PWD = process.env.ADMIN_BOOTSTRAP_PASSWORD;
// MED-O01 fix — refuse to default ROLE to 'super_admin'. Pre-fix
// admins running this script while forgetting to set
// ADMIN_BOOTSTRAP_ROLE silently created a super_admin (and, if email
// existed, silently promoted that user to super_admin). Post-fix:
//   - ADMIN_BOOTSTRAP_ROLE is REQUIRED.
//   - ADMIN_BOOTSTRAP_ROLE='super_admin' additionally requires the
//     `--confirm-super-admin` argv flag so a typo can't escalate by
//     accident.
const ROLE_RAW = process.env.ADMIN_BOOTSTRAP_ROLE;
const ROLE = ROLE_RAW ? ROLE_RAW.toLowerCase() : '';
const email = process.argv[2];
const HAS_SUPER_ADMIN_CONFIRM = process.argv.includes('--confirm-super-admin');

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
  // MED-O01 fix — explicit role required.
  if (!ROLE_RAW || ROLE === '') {
    process.stderr.write(
      'FATAL: ADMIN_BOOTSTRAP_ROLE env var is required.\n' +
        `Allowed: ${Array.from(ALLOWED_ROLES).join(', ')}\n` +
        'Set ADMIN_BOOTSTRAP_ROLE=admin (or super_admin / dpo / finance / support / dispatcher) before running.\n',
    );
    process.exit(1);
  }
  if (!roleIsAllowed(ROLE)) {
    process.stderr.write(
      `FATAL: ADMIN_BOOTSTRAP_ROLE '${ROLE}' invalid. Allowed: ${Array.from(ALLOWED_ROLES).join(', ')}\n`,
    );
    process.exit(1);
  }
  // MED-O01 fix — super_admin requires explicit confirmation.
  if (ROLE === 'super_admin' && !HAS_SUPER_ADMIN_CONFIRM) {
    process.stderr.write(
      'FATAL: super_admin role requires the --confirm-super-admin flag.\n' +
        'Re-run with: npx ts-node packages/api/scripts/bootstrap-admin.ts <email> --confirm-super-admin\n' +
        'This guard prevents accidental escalation when the env var is set + an existing email is the target.\n',
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
    // users.phone is NOT NULL + UNIQUE. Admins sign in by email, but the column
    // is required, so use ADMIN_BOOTSTRAP_PHONE if given, else a synthetic
    // unique placeholder (PH-shaped) so the INSERT doesn't violate NOT NULL.
    const phone =
      process.env.ADMIN_BOOTSTRAP_PHONE ||
      `+639${Math.floor(100000000 + Math.random() * 900000000)}`;
    await db.query(
      `INSERT INTO users (email, password_hash, role, phone, is_active, is_verified, created_at, updated_at)
       VALUES ($1, $2, $3, $4, true, true, NOW(), NOW())`,
      [email, hash, ROLE, phone],
    );
    process.stdout.write(`Created ${ROLE} user: ${email} (phone=${phone})\n`);
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

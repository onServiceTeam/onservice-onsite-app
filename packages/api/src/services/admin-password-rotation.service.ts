/**
 * LAUNCH-LIMITATIONS #12 fix — proactive rotation for legacy password hashes.
 *
 * The opportunistic rehash on login (auth.routes.ts §login) already
 * upgrades a legacy / weaker scrypt hash to the current cost factor
 * inside the same login. Dormant accounts that never log in keep the
 * old hash forever. This service exposes the operator-facing surfaces:
 *
 *   getLegacyPasswordStats():
 *     {total, legacy, current, mustRotate} counts.
 *
 *   flagLegacyHashesForRotation(adminId):
 *     Sets users.must_rotate_password = TRUE on every account whose
 *     password_hash is NOT in the canonical scrypt:N=131072 form. Logs
 *     a single admin_actions row with the affected count.
 *
 *   changeOwnAdminPassword(userId, oldPassword, newPassword):
 *     Verifies oldPassword against the stored hash, validates newPassword
 *     against policy, hashes it with the current SCRYPT_N, updates the
 *     row, clears must_rotate_password, logs admin_password_rotated.
 *
 * The login flow (auth.routes.ts §admin login) checks must_rotate_password
 * after successful verify and includes it in the success response so
 * the admin web app can route straight to the change-password screen.
 *
 * All writes happen in a transaction; counts use the partial index
 * idx_users_must_rotate_password where applicable.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import {
  hashPassword,
  verifyPasswordWithRehash,
  HASH_VERSION,
  SCRYPT_N,
} from './auth.service';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface LegacyPasswordStats {
  /** Total user rows that have a password_hash set (admin tier). */
  total: number;
  /** Rows whose hash isn't `scrypt:131072:8:1:salt:hex`. */
  legacy: number;
  /** Rows on the canonical current cost factor. */
  current: number;
  /** Rows already flagged must_rotate_password = TRUE. */
  mustRotate: number;
}

export interface FlagLegacyResult {
  affected: number;
  alreadyFlagged: number;
  newlyFlagged: number;
}

// Admin tier roles — only these accounts are subject to the rotation
// campaign. Customer + provider accounts use OTP login and don't have
// a meaningful password_hash. Keep in sync with auth.middleware.
const ADMIN_TIER_ROLES = ['admin', 'super_admin', 'dpo'] as const;

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

// Canonical "current" hash predicate: parts[0] === HASH_VERSION AND
// parts[1] === SCRYPT_N (current). Anything else (legacy salt:hash,
// older scrypt N, non-scrypt) is "legacy".
//
// We can't run that test in SQL easily — the parts split + numeric
// compare for parts[1] is awkward in pure SQL. Use a CASE on a
// LIKE pattern with the current N hardcoded: any row that matches
// `scrypt:131072:%` is current; everything else is legacy.
function currentHashPattern(): string {
  return `${HASH_VERSION}:${SCRYPT_N}:%`;
}

// ─────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────

export async function getLegacyPasswordStats(): Promise<LegacyPasswordStats> {
  // Single round-trip for all four counts via FILTER. The CHECK on
  // role keeps us scoped to admin tier accounts.
  const result = await db.query<{
    total: string;
    legacy: string;
    current: string;
    must_rotate: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE password_hash IS NOT NULL)::text AS total,
       COUNT(*) FILTER (
         WHERE password_hash IS NOT NULL
           AND password_hash NOT LIKE $1
       )::text AS legacy,
       COUNT(*) FILTER (
         WHERE password_hash IS NOT NULL
           AND password_hash LIKE $1
       )::text AS current,
       COUNT(*) FILTER (WHERE must_rotate_password = TRUE)::text AS must_rotate
     FROM users
     WHERE role = ANY($2::text[])`,
    [currentHashPattern(), ADMIN_TIER_ROLES],
  );

  const r = result.rows[0];
  return {
    total: Number(r?.total ?? 0),
    legacy: Number(r?.legacy ?? 0),
    current: Number(r?.current ?? 0),
    mustRotate: Number(r?.must_rotate ?? 0),
  };
}

export async function flagLegacyHashesForRotation(
  adminUserId: string,
): Promise<FlagLegacyResult> {
  if (!adminUserId) {
    throw createAppError('adminUserId is required.', 400);
  }

  return db.transaction(async (client) => {
    // Two updates: one for counting "newly flagged" (rows that flipped
    // false→true) and one for counting "already flagged" (rows that
    // were true and would have been hit again). UPDATE ... RETURNING
    // gives us both.
    const newly = await client.query<{ id: string }>(
      `UPDATE users
          SET must_rotate_password = TRUE
        WHERE role = ANY($1::text[])
          AND password_hash IS NOT NULL
          AND password_hash NOT LIKE $2
          AND must_rotate_password = FALSE
        RETURNING id`,
      [ADMIN_TIER_ROLES, currentHashPattern()],
    );

    const already = await client.query<{ cnt: string }>(
      `SELECT COUNT(*)::text AS cnt
         FROM users
        WHERE role = ANY($1::text[])
          AND password_hash IS NOT NULL
          AND password_hash NOT LIKE $2
          AND must_rotate_password = TRUE`,
      [ADMIN_TIER_ROLES, currentHashPattern()],
    );

    const newlyCount = newly.rowCount ?? 0;
    const alreadyCount = Number(already.rows[0]?.cnt ?? 0) - newlyCount;

    // Audit row — single entry per campaign run, not per user, so the
    // audit log doesn't get spammed. Includes the affected user count
    // and the predicate used so the rotation can be verified later.
    // Phase 17 fix — `target_type` must be in the existing CHECK
    // constraint list. 'user_batch' was not in the list (verified
    // 2026-05-03 against the live admin_actions_target_type_check),
    // so the bulk-flag campaign returned 500. Use 'system' since
    // this is a system-wide operation and the affected count + IDs
    // are in details JSONB.
    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'legacy_password_rotation_flagged', 'system', uuid_generate_v4(),
               $2::jsonb, $3)`,
      [
        adminUserId,
        JSON.stringify({
          newlyFlagged: newlyCount,
          alreadyFlagged: Math.max(0, alreadyCount),
          predicate: `password_hash NOT LIKE '${currentHashPattern()}'`,
          scryptN: SCRYPT_N,
          adminTierRoles: ADMIN_TIER_ROLES,
        }),
        'LAUNCH-LIMITATIONS #12 — bulk-flag legacy password hashes for rotation.',
      ],
    );

    logger.info('Legacy password hashes flagged for rotation', {
      adminUserId,
      newlyFlagged: newlyCount,
      alreadyFlagged: Math.max(0, alreadyCount),
    });

    return {
      affected: newlyCount + Math.max(0, alreadyCount),
      newlyFlagged: newlyCount,
      alreadyFlagged: Math.max(0, alreadyCount),
    };
  });
}

export interface ChangePasswordInput {
  userId: string;
  oldPassword: string;
  newPassword: string;
}

export async function changeOwnAdminPassword(input: ChangePasswordInput): Promise<void> {
  if (!input.userId) throw createAppError('userId is required.', 400);
  if (typeof input.oldPassword !== 'string' || input.oldPassword.length === 0) {
    throw createAppError('oldPassword is required.', 400);
  }
  if (typeof input.newPassword !== 'string') {
    throw createAppError('newPassword is required.', 400);
  }
  if (input.newPassword.length < PASSWORD_MIN_LENGTH
      || input.newPassword.length > PASSWORD_MAX_LENGTH) {
    throw createAppError(
      `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      400,
    );
  }
  if (input.newPassword === input.oldPassword) {
    throw createAppError('New password must differ from the current password.', 400);
  }

  return db.transaction(async (client) => {
    const lookup = await client.query<{
      id: string; role: string; password_hash: string | null;
    }>(
      `SELECT id, role, password_hash FROM users WHERE id = $1 FOR UPDATE`,
      [input.userId],
    );
    const user = lookup.rows[0];
    if (!user) throw createAppError('Account not found.', 404);
    if (!ADMIN_TIER_ROLES.includes(user.role as typeof ADMIN_TIER_ROLES[number])) {
      throw createAppError('Password change is only available for admin-tier accounts.', 403);
    }
    if (!user.password_hash) {
      throw createAppError('Password login not configured for this account.', 400);
    }

    const verify = verifyPasswordWithRehash(input.oldPassword, user.password_hash);
    if (!verify.valid) {
      throw createAppError('The old password is incorrect.', 401);
    }

    const newHash = hashPassword(input.newPassword);
    await client.query(
      `UPDATE users
          SET password_hash = $1,
              must_rotate_password = FALSE,
              updated_at = NOW()
        WHERE id = $2`,
      [newHash, input.userId],
    );

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'admin_password_rotated', 'user', $1, $2::jsonb, $3)`,
      [
        input.userId,
        JSON.stringify({
          previousHashUpgraded: verify.needsRehash,
          scryptN: SCRYPT_N,
        }),
        'LAUNCH-LIMITATIONS #12 — admin self-rotated password.',
      ],
    );

    logger.info('Admin password rotated', {
      userId: input.userId,
      previousHashUpgraded: verify.needsRehash,
    });
  });
}

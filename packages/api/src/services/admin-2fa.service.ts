/**
 * Phase 14 Dispatch 10 — Bug 357 + 358 + 360.
 * Admin 2FA backup code generation + verification.
 *
 * 8 single-use 10-char alphanumeric codes per admin. They are generated at
 * 2FA enrollment and shown once; the admin must acknowledge secure storage
 * before entering the console. They are stored as salted scrypt hashes. Once
 * consumed, `used_at` is stamped and the code cannot be reused. Lost
 * authenticator + lost backup codes = governed super-admin recovery (E67).
 */

import crypto from 'node:crypto';
import type { QueryResult, QueryResultRow } from 'pg';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

const BACKUP_CODE_LENGTH = 10;
const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // exclude confusing chars
const BACKUP_CODE_COUNT = 8;

// Match the codebase scrypt pattern from auth.service.ts so backup-code
// hash format is consistent with admin password hashes.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const HASH_VERSION = 'scrypt';

function hashCode(code: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(code, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM,
  }).toString('hex');
  return `${HASH_VERSION}:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${h}`;
}

function verifyCode(code: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 6 || parts[0] !== HASH_VERSION) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4]!;
  const expectedHex = parts[5]!;
  let computed: Buffer;
  try {
    computed = crypto.scryptSync(code, salt, SCRYPT_KEYLEN, {
      N, r, p, maxmem: SCRYPT_MAXMEM,
    });
  } catch {
    return false;
  }
  let stash: Buffer;
  try {
    stash = Buffer.from(expectedHex, 'hex');
  } catch {
    return false;
  }
  if (stash.length !== computed.length) return false;
  return crypto.timingSafeEqual(stash, computed);
}

function generateBackupCode(): string {
  const bytes = new Uint8Array(BACKUP_CODE_LENGTH);
  // Node 18+ globalThis.crypto exposes getRandomValues.
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) {
    out += BACKUP_CODE_ALPHABET[bytes[i]! % BACKUP_CODE_ALPHABET.length];
  }
  return out;
}

export interface BackupCodeBundle {
  /** Plaintext codes — shown to admin ONCE, never persisted in plaintext. */
  codes: string[];
  generatedAt: string;
}

export interface AdminBackupCodeQueryClient {
  query: <R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<QueryResult<R>>;
}

function prepareBackupCodeBundle(): BackupCodeBundle & { hashes: string[] } {
  const codes: string[] = [];
  const hashes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = generateBackupCode();
    codes.push(code);
    hashes.push(hashCode(code));
  }
  return { codes, hashes, generatedAt: new Date().toISOString() };
}

/**
 * Transaction-aware recovery-code writer used when TOTP activation and code
 * creation must commit together. Existing active codes are always soft-
 * deleted first so re-enabling 2FA cannot leave two valid recovery sets.
 */
export async function generateBackupCodesInTransaction(
  client: AdminBackupCodeQueryClient,
  adminUserId: string,
  regenerationContext?: { regeneratedBy: string },
): Promise<BackupCodeBundle> {
  const prepared = prepareBackupCodeBundle();
  const actorId = regenerationContext?.regeneratedBy ?? adminUserId;
  const isRegeneration = !!regenerationContext;

  await client.query(
    `UPDATE admin_backup_codes
        SET deleted_at = NOW(),
            deleted_by = $2
      WHERE admin_user_id = $1
        AND deleted_at IS NULL
        AND used_at IS NULL`,
    [adminUserId, actorId],
  );

  for (const hash of prepared.hashes) {
    await client.query(
      `INSERT INTO admin_backup_codes (admin_user_id, code_hash) VALUES ($1, $2)`,
      [adminUserId, hash],
    );
  }

  await client.query(
    `INSERT INTO admin_actions
       (admin_id, action_type, target_type, target_id, details, reason)
     VALUES ($1, $2, 'user', $3, $4::jsonb, $5)`,
    [
      actorId,
      isRegeneration ? 'admin_backup_codes_regenerated' : 'admin_backup_codes_generated',
      adminUserId,
      JSON.stringify({ codeCount: BACKUP_CODE_COUNT }),
      isRegeneration
        ? 'Backup codes regenerated (prior set soft-deleted)'
        : 'Backup codes generated at 2FA enrollment',
    ],
  );

  return { codes: prepared.codes, generatedAt: prepared.generatedAt };
}

/**
 * Generate 8 backup codes for an admin user. Existing active codes are
 * soft-deleted (deleted_at + deleted_by stamped) so the regeneration is
 * traceable. Returns plaintext codes for the admin UI to show once.
 */
export async function generateBackupCodes(
  adminUserId: string,
  regenerationContext?: { regeneratedBy: string },
): Promise<BackupCodeBundle> {
  const isRegeneration = !!regenerationContext;
  const bundle = await db.transaction((client) => (
    generateBackupCodesInTransaction(client, adminUserId, regenerationContext)
  ));

  logger.info('Admin backup codes generated', {
    adminUserId,
    count: BACKUP_CODE_COUNT,
    regeneration: isRegeneration,
  });

  return bundle;
}

/**
 * Verify a backup code at login (when admin can't access authenticator).
 * Single-use: on success, marks the row used_at + used_ip and writes audit.
 */
export async function consumeBackupCode(
  adminUserId: string,
  code: string,
  ipAddress?: string,
): Promise<{ remainingCodes: number }> {
  const cleanCode = (code ?? '').trim().toUpperCase();
  if (cleanCode.length !== BACKUP_CODE_LENGTH) {
    throw createAppError('Invalid backup code format.', 400);
  }

  const result = await db.transaction(async (client) => {
    const candidates = await client.query<{ id: string; code_hash: string }>(
      `SELECT id, code_hash FROM admin_backup_codes
        WHERE admin_user_id = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
        FOR UPDATE`,
      [adminUserId],
    );

    let matchedId: string | null = null;
    for (const candidate of candidates.rows) {
      if (verifyCode(cleanCode, candidate.code_hash)) {
        matchedId = candidate.id;
        break;
      }
    }

    if (!matchedId) {
      throw createAppError('Invalid or already-used backup code.', 401);
    }

    await client.query(
      `UPDATE admin_backup_codes
          SET used_at = NOW(),
              used_ip = $2
        WHERE id = $1`,
      [matchedId, ipAddress ?? null],
    );

    await client.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, 'admin_backup_code_used', 'user', $1, $2::jsonb, $3)`,
      [
        adminUserId,
        JSON.stringify({ ipAddress: ipAddress ?? null }),
        'Backup code consumed at login',
      ],
    );

    const remaining = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM admin_backup_codes
        WHERE admin_user_id = $1
          AND used_at IS NULL
          AND deleted_at IS NULL`,
      [adminUserId],
    );

    return { remainingCodes: Number(remaining.rows[0]?.count ?? 0) };
  });
  logger.info('Admin backup code consumed', {
    adminUserId,
    remaining: result.remainingCodes,
  });
  return result;
}

/**
 * Returns the count of unused backup codes for an admin. Used by the
 * admin UI to surface "you have 2 backup codes left — generate more".
 */
export async function countActiveBackupCodes(adminUserId: string): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM admin_backup_codes
      WHERE admin_user_id = $1
        AND used_at IS NULL
        AND deleted_at IS NULL`,
    [adminUserId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

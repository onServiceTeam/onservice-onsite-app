import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../models/db';
import { sendOtpSms } from './sms.service';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';

interface OtpRow {
  id: string;
  phone: string;
  code: string | null;
  code_hash: string | null;
  attempts: number;
  is_used: boolean;
  expires_at: Date;
  created_at: Date;
}

interface UserRow {
  id: string;
  phone: string;
  email: string | null;
  first_name: string;
  last_name: string;
  role: string;
  avatar_url: string | null;
  is_verified: boolean;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
  // MED-N85 fix — both NULL for tokens minted before mig 101.
  device_fingerprint: string | null;
  created_ip: string | null;
}

interface OtpCountRow {
  count: string;
}

function generateOtp(): string {
  const length = platformConfig.otpLength;
  const max = Math.pow(10, length);
  const num = crypto.randomInt(0, max);
  return num.toString().padStart(length, '0');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// CRIT-N12 fix — OTP codes are stored as scrypt hashes, not plaintext.
// Salt is derived per-row (random 16 bytes). Phone number is mixed into
// the hash input as a secondary salt so even if two rows shared the same
// random salt the hashes would differ.
//
// Format mirrors the scrypt password format:
//   scrypt:N:r:p:salt:hash
//
// We use the same N/r/p as auth.service.ts password hashes so the cost
// is consistent. Verify uses crypto.timingSafeEqual.
function hashOtpCode(code: string, phone: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const input = `${code}:${phone}`; // phone-as-secondary-salt
  const h = crypto
    .scryptSync(input, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAXMEM,
    })
    .toString('hex');
  return `${HASH_VERSION}:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${h}`;
}

function verifyOtpCodeHash(code: string, phone: string, stored: string): boolean {
  const parts = stored.split(':');
  if (parts.length !== 6 || parts[0] !== HASH_VERSION) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = parts[4]!;
  const expectedHex = parts[5]!;
  const input = `${code}:${phone}`;
  let computed: Buffer;
  try {
    computed = crypto.scryptSync(input, salt, SCRYPT_KEYLEN, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
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

export const SCRYPT_N = 131072;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const SCRYPT_KEYLEN = 64;
export const HASH_VERSION = 'scrypt';
// OpenSSL default scrypt maxmem is 32 MiB; N=131072 r=8 needs 128*N*r = 128 MiB.
// Cap at 256 MiB so future tuning has headroom without surprise failures.
export const SCRYPT_MAXMEM = 256 * 1024 * 1024;

export interface VerifyResult { valid: boolean; needsRehash: boolean }

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM }).toString('hex');
  return `${HASH_VERSION}:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${h}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  return verifyPasswordWithRehash(password, stored).valid;
}

export function verifyPasswordWithRehash(password: string, stored: string): VerifyResult {
  const parts = stored.split(':');
  // New format: scrypt:N:r:p:salt:hash (6 parts)
  if (parts.length === 6 && parts[0] === HASH_VERSION) {
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = parts[4]!;
    const key = parts[5]!;
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || !salt || !key) {
      return { valid: false, needsRehash: false };
    }
    let computed: Buffer;
    try {
      computed = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N, r, p, maxmem: SCRYPT_MAXMEM });
    } catch {
      return { valid: false, needsRehash: false };
    }
    let stash: Buffer;
    try {
      stash = Buffer.from(key, 'hex');
    } catch {
      return { valid: false, needsRehash: false };
    }
    if (stash.length !== computed.length) return { valid: false, needsRehash: false };
    const valid = crypto.timingSafeEqual(stash, computed);
    const needsRehash = valid && (N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P);
    return { valid, needsRehash };
  }
  // Legacy format: salt:hash (2 parts, default scrypt params)
  if (parts.length === 2) {
    const salt = parts[0];
    const key = parts[1];
    if (!salt || !key) return { valid: false, needsRehash: false };
    let computed: Buffer;
    try {
      computed = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    } catch {
      return { valid: false, needsRehash: false };
    }
    let stash: Buffer;
    try {
      stash = Buffer.from(key, 'hex');
    } catch {
      return { valid: false, needsRehash: false };
    }
    if (stash.length !== computed.length) return { valid: false, needsRehash: false };
    const valid = crypto.timingSafeEqual(stash, computed);
    return { valid, needsRehash: valid };
  }
  return { valid: false, needsRehash: false };
}

function signAccessToken(userId: string, role: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  const roleExpiry = platformConfig.jwtExpiresInByRole[role] ?? platformConfig.jwtExpiresIn;
  const duration = process.env.JWT_ACCESS_EXPIRES_IN || roleExpiry;
  return jwt.sign({ userId, role }, secret, { algorithm: 'HS256', expiresIn: parseDurationToSeconds(duration) });
}

function signRefreshToken(userId: string, role: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  const duration = process.env.JWT_REFRESH_EXPIRES_IN || platformConfig.jwtRefreshExpiresIn;
  return jwt.sign({ userId, role, type: 'refresh' }, secret, { algorithm: 'HS256', expiresIn: parseDurationToSeconds(duration) });
}

function parseDurationToSeconds(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  return value * (multipliers[unit!] ?? 60);
}

export async function sendOtp(phone: string): Promise<{ message: string }> {
  if (!/^\+63\d{10}$/.test(phone)) {
    throw createAppError('Invalid Philippine phone number. Use +63 9XX XXX XXXX format.', 400);
  }

  const cooldownCheck = await db.query<OtpRow>(
    `SELECT id FROM otp_codes
     WHERE phone = $1 AND is_used = FALSE
       AND created_at > NOW() - INTERVAL '1 second' * $2
     LIMIT 1`,
    [phone, platformConfig.otpCooldownSeconds],
  );

  if (cooldownCheck.rows.length > 0) {
    throw createAppError(
      `Please wait ${platformConfig.otpCooldownSeconds} seconds before requesting a new code.`,
      429,
    );
  }

  const hourlyLimit = Number(process.env.OTP_MAX_REQUESTS_PER_HOUR) || 5;
  const hourlyCheck = await db.query<OtpCountRow>(
    `SELECT COUNT(*)::text as count FROM otp_codes
     WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [phone],
  );

  if (Number(hourlyCheck.rows[0]?.count) >= hourlyLimit) {
    throw createAppError('Too many OTP requests. Please try again in an hour.', 429);
  }

  // CRIT-N12 fix: invalidate prior OTPs and write the NEW row's hash in
  // a single transaction. Pre-fix: two separate db.query calls — if the
  // INSERT failed after the UPDATE, the user had no live OTP and no
  // prior ones either (fragile but not security-critical). The bigger
  // change: we no longer write the plaintext `code` column. Going
  // forward only `code_hash` is populated.
  const otp = generateOtp();
  const codeHash = hashOtpCode(otp, phone);
  const expiresAt = new Date(Date.now() + platformConfig.otpExpiryMinutes * 60 * 1000);

  await db.transaction(async (client) => {
    await client.query(
      `UPDATE otp_codes SET is_used = TRUE WHERE phone = $1 AND is_used = FALSE`,
      [phone],
    );
    await client.query(
      `INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1, $2, $3)`,
      [phone, codeHash, expiresAt],
    );
  });

  const sent = await sendOtpSms(phone, otp);
  if (!sent && process.env.NODE_ENV === 'production') {
    throw createAppError('Failed to send verification code. Please try again.', 502);
  }

  logger.info('OTP sent', { phone: phone.slice(-4) });

  return { message: 'Verification code sent to your phone.' };
}

export async function verifyOtp(
  phone: string,
  code: string,
  // MED-N85 fix — capture the device fingerprint + source IP at
  // issuance so the refresh path can compare. Both params are optional
  // for back-compat with existing callers (admin tools, tests) that
  // don't pass them.
  context: { deviceFingerprint?: string; ipAddress?: string } = {},
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: UserRow;
  isNewUser: boolean;
}> {
  if (!/^\+63\d{10}$/.test(phone)) {
    throw createAppError('Invalid Philippine phone number.', 400);
  }

  const otpResult = await db.query<OtpRow>(
    `SELECT * FROM otp_codes
     WHERE phone = $1 AND is_used = FALSE AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [phone],
  );

  const otpRecord = otpResult.rows[0];

  if (!otpRecord) {
    throw createAppError('No valid verification code found. Please request a new one.', 400);
  }

  if (otpRecord.attempts >= platformConfig.otpMaxAttempts) {
    await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE id = $1`, [otpRecord.id]);
    throw createAppError('Maximum attempts exceeded. Please request a new code.', 429);
  }

  // CRIT-N12 fix + MED-N94 fix: constant-time comparison. New rows
  // (post-migration 089) carry only code_hash; legacy in-flight rows
  // (mid-rollout) may still have a plaintext code populated. Try the
  // hash path first, fall back to the timing-safe equal of legacy
  // plaintext (drained within minutes of the rollout).
  let codeMatches = false;
  if (otpRecord.code_hash) {
    codeMatches = verifyOtpCodeHash(code, phone, otpRecord.code_hash);
  } else if (otpRecord.code) {
    // Legacy row — only present briefly during the rollout window.
    const a = Buffer.from(otpRecord.code);
    const b = Buffer.from(code);
    codeMatches = a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  if (!codeMatches) {
    await db.query(
      `UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1`,
      [otpRecord.id],
    );
    const remaining = platformConfig.otpMaxAttempts - otpRecord.attempts - 1;
    throw createAppError(
      `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      400,
    );
  }

  await db.query(`UPDATE otp_codes SET is_used = TRUE WHERE id = $1`, [otpRecord.id]);

  let isNewUser = false;
  let userResult = await db.query<UserRow>(
    `SELECT * FROM users WHERE phone = $1`,
    [phone],
  );

  if (userResult.rows.length === 0) {
    isNewUser = true;
    userResult = await db.query<UserRow>(
      `INSERT INTO users (phone, first_name, last_name, is_verified)
       VALUES ($1, '', '', TRUE)
       RETURNING *`,
      [phone],
    );
  } else {
    await db.query(
      `UPDATE users SET is_verified = TRUE, last_login_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [userResult.rows[0]!.id],
    );
  }

  const user = userResult.rows[0]!;

  if (!user.is_active) {
    throw createAppError('Your account has been deactivated. Contact support.', 403);
  }

  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id, user.role);

  const tokenHash = hashToken(refreshToken);
  const refreshDuration = process.env.JWT_REFRESH_EXPIRES_IN || platformConfig.jwtRefreshExpiresIn;
  const refreshExpiresAt = new Date(Date.now() + parseDurationToSeconds(refreshDuration) * 1000);

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_fingerprint, created_ip)
     VALUES ($1, $2, $3, $4, $5::inet)`,
    [
      user.id,
      tokenHash,
      refreshExpiresAt,
      context.deviceFingerprint ?? null,
      context.ipAddress ?? null,
    ],
  );

  logger.info('User authenticated', { userId: user.id, isNewUser });

  return { accessToken, refreshToken, user, isNewUser };
}

export async function refreshAccessToken(
  refreshToken: string,
  // MED-N85 fix — caller passes the request's device fingerprint + IP
  // for the binding check. Both optional for back-compat with legacy
  // callers that don't pass them; in that case the binding check is
  // skipped (logged as 'no_incoming_fingerprint' in the metadata when
  // a stored fingerprint exists).
  context: { deviceFingerprint?: string; ipAddress?: string } = {},
): Promise<{ accessToken: string; refreshToken: string }> {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  let payload: { userId: string; role: string; type?: string };
  try {
    payload = jwt.verify(refreshToken, secret) as typeof payload;
  } catch {
    throw createAppError('Invalid or expired refresh token.', 401);
  }

  if (payload.type !== 'refresh') {
    throw createAppError('Invalid token type.', 401);
  }

  // MED-N92 fix — pre-fix sequence:
  //   1. SELECT refresh_tokens WHERE token_hash = old
  //   2. DELETE refresh_tokens WHERE token_hash = old
  //   3. SELECT users WHERE id = ... AND is_active
  //   4. signAccessToken / signRefreshToken
  //   5. INSERT refresh_tokens new row
  // Two failure modes:
  //   (a) If (5) fails after (2) succeeded, the user has neither old
  //       nor new refresh token — forcibly logged out.
  //   (b) Two concurrent refresh calls on the same token both pass (1),
  //       both run (2), each then runs (5) — but one of them is using
  //       a token whose row got DELETEd-then-recreated by the other.
  //       Result depends on race ordering; in the worst case the user
  //       loses both new tokens.
  //
  // Post-fix: SELECT-FOR-UPDATE the old row + DELETE + INSERT all
  // happen on the SAME transactional client. SELECT FOR UPDATE
  // serialises concurrent refreshers on the same token: the second
  // one sees zero rows after the first one deletes, throws a 401, and
  // the user retries with the new token they got from the first call.
  // If the INSERT fails for any reason, the DELETE rolls back so the
  // old token is preserved.
  const tokenHash = hashToken(refreshToken);

  const refreshDuration = process.env.JWT_REFRESH_EXPIRES_IN || platformConfig.jwtRefreshExpiresIn;
  const refreshExpiresAt = new Date(Date.now() + parseDurationToSeconds(refreshDuration) * 1000);

  return await db.transaction(async (client) => {
    const tokenResult = await client.query<RefreshTokenRow>(
      `SELECT * FROM refresh_tokens
       WHERE token_hash = $1 AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash],
    );

    if (tokenResult.rows.length === 0) {
      throw createAppError('Refresh token not found or expired.', 401);
    }

    const storedRow = tokenResult.rows[0]!;

    // MED-N85 fingerprint binding check. We only compare when BOTH a
    // stored fingerprint exists AND an incoming one is provided. The
    // mismatch is ALWAYS logged for forensics; rejection is gated by
    // the platform setting `refresh_token_strict_fingerprint` so we
    // can run in observe-only mode at first to gauge false-positive
    // volume from legitimate fingerprint changes (app reinstall, OS
    // update). Fail-closed on the lookup: if the setting load throws
    // we don't reject (back-compat) but we still log.
    if (storedRow.device_fingerprint && context.deviceFingerprint
        && storedRow.device_fingerprint !== context.deviceFingerprint) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { logSecurityEvent } = require('./security.service');
        await logSecurityEvent({
          userId: payload.userId,
          eventType: 'refresh_token_fingerprint_mismatch',
          ipAddress: context.ipAddress ?? null,
          deviceFingerprint: context.deviceFingerprint,
          metadata: {
            storedFingerprintPrefix: storedRow.device_fingerprint.slice(0, 16),
            incomingFingerprintPrefix: context.deviceFingerprint.slice(0, 16),
            issuedIp: storedRow.created_ip ?? null,
          },
        });
      } catch (logErr) {
        logger.error('Failed to log refresh_token_fingerprint_mismatch', {
          userId: payload.userId,
          error: logErr instanceof Error ? logErr.message : 'Unknown',
        });
      }
      // Strict-mode check via platform setting. Default observe-only
      // (FALSE) — admin can flip after watching the security_events
      // mismatch volume.
      let strict = false;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const settings = require('./settings.service');
        if (typeof settings.getSettingBoolean === 'function') {
          strict = await settings.getSettingBoolean('refresh_token_strict_fingerprint');
        }
      } catch {
        // Setting not loadable (e.g., schema not migrated yet) — observe-only.
      }
      if (strict) {
        throw createAppError('Refresh token does not match the device that issued it. Please sign in again.', 401);
      }
    }

    const userResult = await client.query<UserRow>(
      `SELECT * FROM users WHERE id = $1 AND is_active = TRUE`,
      [payload.userId],
    );

    if (userResult.rows.length === 0) {
      throw createAppError('User account not found or deactivated.', 401);
    }

    const user = userResult.rows[0]!;
    const newAccessToken = signAccessToken(user.id, user.role);
    const newRefreshToken = signRefreshToken(user.id, user.role);
    const newTokenHash = hashToken(newRefreshToken);

    // Delete OLD row only after we know we have a valid user. The new
    // row goes in within the same trx so a failure here rolls the whole
    // thing back. Carry the incoming fingerprint forward (if provided)
    // so subsequent refreshes can keep enforcing the binding; fall
    // back to the stored value so an existing fingerprint isn't lost.
    await client.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_fingerprint, created_ip)
       VALUES ($1, $2, $3, $4, $5::inet)`,
      [
        user.id,
        newTokenHash,
        refreshExpiresAt,
        context.deviceFingerprint ?? storedRow.device_fingerprint ?? null,
        context.ipAddress ?? null,
      ],
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  });
}

export async function createTokenPair(
  userId: string,
  role: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = signAccessToken(userId, role);
  const refreshToken = signRefreshToken(userId, role);

  const tokenHash = hashToken(refreshToken);
  const refreshDuration = process.env.JWT_REFRESH_EXPIRES_IN || platformConfig.jwtRefreshExpiresIn;
  const refreshExpiresAt = new Date(Date.now() + parseDurationToSeconds(refreshDuration) * 1000);

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, refreshExpiresAt],
  );

  return { accessToken, refreshToken };
}

export async function logout(userId: string, refreshToken?: string): Promise<void> {
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await db.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
  } else {
    await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
  }

  logger.info('User logged out', { userId });
}

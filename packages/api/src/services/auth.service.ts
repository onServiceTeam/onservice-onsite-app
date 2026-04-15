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
  code: string;
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

export function hashPassword(password: string, salt?: string): string {
  const s = salt ?? crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(password, s, 64).toString('hex');
  return `${s}:${h}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const h = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(h));
}

function signAccessToken(userId: string, role: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  const duration = process.env.JWT_ACCESS_EXPIRES_IN || platformConfig.jwtExpiresIn;
  return jwt.sign({ userId, role }, secret, { expiresIn: parseDurationToSeconds(duration) });
}

function signRefreshToken(userId: string, role: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');

  const duration = process.env.JWT_REFRESH_EXPIRES_IN || platformConfig.jwtRefreshExpiresIn;
  return jwt.sign({ userId, role, type: 'refresh' }, secret, { expiresIn: parseDurationToSeconds(duration) });
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

  await db.query(
    `UPDATE otp_codes SET is_used = TRUE WHERE phone = $1 AND is_used = FALSE`,
    [phone],
  );

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + platformConfig.otpExpiryMinutes * 60 * 1000);

  await db.query(
    `INSERT INTO otp_codes (phone, code, expires_at) VALUES ($1, $2, $3)`,
    [phone, otp, expiresAt],
  );

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

  if (otpRecord.code !== code) {
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
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, refreshExpiresAt],
  );

  logger.info('User authenticated', { userId: user.id, isNewUser });

  return { accessToken, refreshToken, user, isNewUser };
}

export async function refreshAccessToken(
  refreshToken: string,
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

  const tokenHash = hashToken(refreshToken);
  const tokenResult = await db.query<RefreshTokenRow>(
    `SELECT * FROM refresh_tokens
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash],
  );

  if (tokenResult.rows.length === 0) {
    throw createAppError('Refresh token not found or expired.', 401);
  }

  await db.query(`DELETE FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);

  const userResult = await db.query<UserRow>(
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
  const refreshDuration = process.env.JWT_REFRESH_EXPIRES_IN || platformConfig.jwtRefreshExpiresIn;
  const refreshExpiresAt = new Date(Date.now() + parseDurationToSeconds(refreshDuration) * 1000);

  await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, newTokenHash, refreshExpiresAt],
  );

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
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

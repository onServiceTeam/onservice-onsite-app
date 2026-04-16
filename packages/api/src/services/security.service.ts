import { db } from '../models/db';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';

// --- Interfaces ---

interface DeviceFingerprintRow {
  id: string;
  user_id: string;
  fingerprint: string;
  device_name: string | null;
  platform: 'ios' | 'android' | 'web' | null;
  is_trusted: boolean;
  last_seen_at: Date;
  last_ip: string | null;
  created_at: Date;
}

interface BlockedIpRow {
  id: string;
  ip_address: string;
  reason: string;
  blocked_by: string | null;
  expires_at: Date | null;
  is_active: boolean;
  created_at: Date;
}

interface SecurityEventRow {
  id: string;
  user_id: string | null;
  event_type: string;
  ip_address: string | null;
  device_fingerprint: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

const OTP_LOCKOUT_THRESHOLDS = platformConfig.otpLockoutThresholds;
const CAPTCHA_THRESHOLD = platformConfig.captchaThreshold;

// --- OTP Abuse Protection ---

export async function recordLoginAttempt(params: {
  phone: string;
  ipAddress: string;
  attemptType: 'otp_send' | 'otp_verify' | 'admin_login';
  success: boolean;
  deviceFingerprint?: string;
  userAgent?: string;
}): Promise<void> {
  await db.query(
    `INSERT INTO login_attempts (phone, ip_address, attempt_type, success, device_fingerprint, user_agent)
     VALUES ($1, $2::inet, $3, $4, $5, $6)`,
    [
      params.phone,
      params.ipAddress,
      params.attemptType,
      params.success,
      params.deviceFingerprint ?? null,
      params.userAgent ?? null,
    ],
  );
}

export async function checkOtpLockout(phone: string, ipAddress: string): Promise<{
  locked: boolean;
  lockoutEndsAt?: Date;
  captchaRequired: boolean;
}> {
  const windowHours = 24;
  const failedResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM login_attempts
     WHERE phone = $1 AND success = FALSE
       AND attempt_type IN ('otp_send', 'otp_verify')
       AND created_at > NOW() - INTERVAL '1 hour' * $2`,
    [phone, windowHours],
  );

  const failedCount = Number(failedResult.rows[0]?.count ?? 0);

  const ipFailedResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM login_attempts
     WHERE ip_address = $1::inet AND success = FALSE
       AND attempt_type IN ('otp_send', 'otp_verify')
       AND created_at > NOW() - INTERVAL '1 hour'`,
    [ipAddress],
  );

  const ipFailedCount = Number(ipFailedResult.rows[0]?.count ?? 0);

  const effectiveCount = Math.max(failedCount, ipFailedCount);
  const captchaRequired = effectiveCount >= CAPTCHA_THRESHOLD;

  for (let i = OTP_LOCKOUT_THRESHOLDS.length - 1; i >= 0; i--) {
    const threshold = OTP_LOCKOUT_THRESHOLDS[i]!;
    if (effectiveCount >= threshold.failures) {
      const lockoutEndsAt = new Date(Date.now() + threshold.lockoutMinutes * 60 * 1000);

      const recentLockout = await db.query<{ locked_until: Date }>(
        `SELECT locked_until FROM login_attempts
         WHERE phone = $1 AND locked_until IS NOT NULL AND locked_until > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [phone],
      );

      if (recentLockout.rows.length > 0) {
        return {
          locked: true,
          lockoutEndsAt: recentLockout.rows[0]!.locked_until,
          captchaRequired: true,
        };
      }

      await db.query(
        `UPDATE login_attempts SET locked_until = $2
         WHERE id = (
           SELECT id FROM login_attempts
           WHERE phone = $1 AND success = FALSE
           ORDER BY created_at DESC LIMIT 1
         )`,
        [phone, lockoutEndsAt.toISOString()],
      );

      await logSecurityEvent({
        eventType: 'otp_lockout',
        ipAddress,
        metadata: {
          phone: phone.slice(-4),
          failedCount: effectiveCount,
          lockoutMinutes: threshold.lockoutMinutes,
        },
      });

      logger.warn('OTP lockout triggered', {
        phone: phone.slice(-4),
        failedCount: effectiveCount,
        lockoutMinutes: threshold.lockoutMinutes,
      });

      return { locked: true, lockoutEndsAt, captchaRequired: true };
    }
  }

  return { locked: false, captchaRequired };
}

export async function verifyCaptchaToken(token: string): Promise<boolean> {
  const captchaSecret = process.env.CAPTCHA_SECRET_KEY;

  if (!captchaSecret) {
    if (process.env.NODE_ENV === 'development') {
      logger.info('[DEV] CAPTCHA verification skipped — no secret key');
      return true;
    }
    logger.warn('CAPTCHA_SECRET_KEY not configured');
    return false;
  }

  try {
    const response = await globalThis.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new globalThis.URLSearchParams({ secret: captchaSecret, response: token }),
    });

    const data = (await response.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    logger.error('CAPTCHA verification failed', {
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return false;
  }
}

// --- Device Fingerprinting ---

export async function registerDeviceFingerprint(params: {
  userId: string;
  fingerprint: string;
  deviceName?: string;
  platform?: 'ios' | 'android' | 'web';
  ipAddress: string;
}): Promise<{ isNewDevice: boolean }> {
  const existing = await db.query<DeviceFingerprintRow>(
    `SELECT id FROM device_fingerprints WHERE user_id = $1 AND fingerprint = $2`,
    [params.userId, params.fingerprint],
  );

  if (existing.rows.length > 0) {
    await db.query(
      `UPDATE device_fingerprints
       SET last_seen_at = NOW(), last_ip = $3::inet, device_name = COALESCE($4, device_name)
       WHERE user_id = $1 AND fingerprint = $2`,
      [params.userId, params.fingerprint, params.ipAddress, params.deviceName ?? null],
    );
    return { isNewDevice: false };
  }

  await db.query(
    `INSERT INTO device_fingerprints (user_id, fingerprint, device_name, platform, last_ip)
     VALUES ($1, $2, $3, $4, $5::inet)`,
    [
      params.userId,
      params.fingerprint,
      params.deviceName ?? null,
      params.platform ?? null,
      params.ipAddress,
    ],
  );

  const deviceCount = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM device_fingerprints WHERE user_id = $1`,
    [params.userId],
  );

  if (Number(deviceCount.rows[0]?.count ?? 0) > 1) {
    await logSecurityEvent({
      userId: params.userId,
      eventType: 'new_device_login',
      ipAddress: params.ipAddress,
      deviceFingerprint: params.fingerprint,
      metadata: { deviceName: params.deviceName, platform: params.platform },
    });
  }

  return { isNewDevice: true };
}

export async function getUserDevices(
  userId: string,
): Promise<DeviceFingerprintRow[]> {
  const result = await db.query<DeviceFingerprintRow>(
    `SELECT * FROM device_fingerprints WHERE user_id = $1 ORDER BY last_seen_at DESC`,
    [userId],
  );
  return result.rows;
}

export async function revokeDevice(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM device_fingerprints WHERE id = $1 AND user_id = $2`,
    [deviceId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function trustDevice(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE device_fingerprints SET is_trusted = TRUE WHERE id = $1 AND user_id = $2`,
    [deviceId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

// --- IP Blocking ---

export async function isIpBlocked(ipAddress: string): Promise<boolean> {
  const result = await db.query<{ id: string }>(
    `SELECT id FROM blocked_ips
     WHERE ip_address = $1::inet AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [ipAddress],
  );
  return result.rows.length > 0;
}

export async function blockIp(params: {
  ipAddress: string;
  reason: string;
  blockedBy?: string;
  expiresInHours?: number;
}): Promise<BlockedIpRow> {
  const expiresAt = params.expiresInHours
    ? new Date(Date.now() + params.expiresInHours * 3600000)
    : null;

  const result = await db.query<BlockedIpRow>(
    `INSERT INTO blocked_ips (ip_address, reason, blocked_by, expires_at)
     VALUES ($1::inet, $2, $3, $4)
     ON CONFLICT (ip_address) WHERE is_active = TRUE
     DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at, blocked_by = EXCLUDED.blocked_by
     RETURNING *`,
    [params.ipAddress, params.reason, params.blockedBy ?? null, expiresAt?.toISOString() ?? null],
  );

  await logSecurityEvent({
    userId: params.blockedBy ?? undefined,
    eventType: 'ip_blocked',
    ipAddress: params.ipAddress,
    metadata: { reason: params.reason, expiresInHours: params.expiresInHours },
  });

  logger.info('IP blocked', {
    ipAddress: params.ipAddress,
    reason: params.reason,
    expiresAt: expiresAt?.toISOString(),
  });

  return result.rows[0]!;
}

export async function unblockIp(
  ipAddress: string,
  unblockedBy?: string,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE blocked_ips SET is_active = FALSE WHERE ip_address = $1::inet AND is_active = TRUE`,
    [ipAddress],
  );

  if ((result.rowCount ?? 0) > 0) {
    await logSecurityEvent({
      userId: unblockedBy,
      eventType: 'ip_unblocked',
      ipAddress,
      metadata: {},
    });

    logger.info('IP unblocked', { ipAddress });
    return true;
  }
  return false;
}

export async function listBlockedIps(
  page = 1,
  pageSize = 20,
): Promise<{ items: BlockedIpRow[]; total: number }> {
  const safePageSize = Math.min(pageSize, platformConfig.maxPageSize);
  const offset = (page - 1) * safePageSize;

  const [dataResult, countResult] = await Promise.all([
    db.query<BlockedIpRow>(
      `SELECT * FROM blocked_ips WHERE is_active = TRUE
       ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [safePageSize, offset],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM blocked_ips WHERE is_active = TRUE`,
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// --- Security Events ---

export async function logSecurityEvent(params: {
  userId?: string;
  eventType: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.query(
    `INSERT INTO security_events (user_id, event_type, ip_address, device_fingerprint, metadata)
     VALUES ($1, $2, $3::inet, $4, $5)`,
    [
      params.userId ?? null,
      params.eventType,
      params.ipAddress ?? null,
      params.deviceFingerprint ?? null,
      JSON.stringify(params.metadata ?? {}),
    ],
  );
}

export async function listSecurityEvents(
  page = 1,
  pageSize = 20,
  filters?: { userId?: string; eventType?: string; ipAddress?: string },
): Promise<{ items: SecurityEventRow[]; total: number }> {
  const safePageSize = Math.min(pageSize, platformConfig.maxPageSize);
  const offset = (page - 1) * safePageSize;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(filters.userId);
  }
  if (filters?.eventType) {
    conditions.push(`event_type = $${paramIndex++}`);
    params.push(filters.eventType);
  }
  if (filters?.ipAddress) {
    conditions.push(`ip_address = $${paramIndex++}::inet`);
    params.push(filters.ipAddress);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    db.query<SecurityEventRow>(
      `SELECT * FROM security_events ${whereClause}
       ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, safePageSize, offset],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM security_events ${whereClause}`,
      params,
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

// --- Auto-block suspicious IPs ---

export async function detectSuspiciousIps(): Promise<number> {
  const threshold = platformConfig.suspiciousIpThreshold;

  const suspicious = await db.query<{ ip_address: string; fail_count: string }>(
    `SELECT ip_address, COUNT(*)::text AS fail_count FROM login_attempts
     WHERE success = FALSE AND created_at > NOW() - INTERVAL '1 hour'
     GROUP BY ip_address
     HAVING COUNT(*) >= $1`,
    [threshold],
  );

  let blocked = 0;

  for (const row of suspicious.rows) {
    const alreadyBlocked = await isIpBlocked(row.ip_address);
    if (!alreadyBlocked) {
      await blockIp({
        ipAddress: row.ip_address,
        reason: `Auto-blocked: ${row.fail_count} failed login attempts in 1 hour`,
        expiresInHours: 24,
      });
      blocked++;
    }
  }

  if (blocked > 0) {
    logger.info('Auto-blocked suspicious IPs', { count: blocked });
  }

  return blocked;
}

// --- Cleanup ---

export async function cleanupOldLoginAttempts(): Promise<number> {
  const result = await db.query(
    `DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
    [platformConfig.loginAttemptRetentionDays],
  );
  return result.rowCount ?? 0;
}

export async function expireBlockedIps(): Promise<number> {
  const result = await db.query(
    `UPDATE blocked_ips SET is_active = FALSE
     WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at <= NOW()`,
  );
  return result.rowCount ?? 0;
}

// --- Formatters ---

export function formatBlockedIp(row: BlockedIpRow): {
  id: string; ipAddress: string; reason: string; blockedBy: string | null;
  expiresAt: Date | null; isActive: boolean; createdAt: Date;
} {
  return {
    id: row.id,
    ipAddress: row.ip_address,
    reason: row.reason,
    blockedBy: row.blocked_by,
    expiresAt: row.expires_at,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export function formatSecurityEvent(row: SecurityEventRow): {
  id: string; userId: string | null; eventType: string; ipAddress: string | null;
  deviceFingerprint: string | null; metadata: Record<string, unknown>; createdAt: Date;
} {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    ipAddress: row.ip_address,
    deviceFingerprint: row.device_fingerprint,
    metadata: row.metadata,
    createdAt: row.created_at,
  };
}

export function formatDeviceFingerprint(row: DeviceFingerprintRow): {
  id: string; userId: string; fingerprint: string; deviceName: string | null;
  platform: 'ios' | 'android' | 'web' | null; isTrusted: boolean;
  lastSeenAt: Date; lastIp: string | null; createdAt: Date;
} {
  return {
    id: row.id,
    userId: row.user_id,
    fingerprint: row.fingerprint,
    deviceName: row.device_name,
    platform: row.platform,
    isTrusted: row.is_trusted,
    lastSeenAt: row.last_seen_at,
    lastIp: row.last_ip,
    createdAt: row.created_at,
  };
}

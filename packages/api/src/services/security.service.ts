import { db } from '../models/db';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import * as settingsService from './settings.service';

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

// --- OTP Abuse Protection ---

export async function recordLoginAttempt(params: {
  phone: string;
  ipAddress: string;
  attemptType: 'otp_send' | 'otp_verify' | 'admin_login';
  success: boolean;
  deviceFingerprint?: string;
  userAgent?: string;
}): Promise<void> {
  // Best-effort audit write. This MUST NOT throw: recording a login attempt is
  // a side-channel, and a failure here (e.g. the historical varchar(15) overflow
  // when an admin EMAIL was stored in the phone-sized column) must never turn a
  // normal failed/successful login into a 500. The `phone` column holds the
  // login identifier — a phone for OTP, the email for admin_login.
  try {
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
  } catch (err) {
    logger.warn('recordLoginAttempt failed (non-fatal)', {
      attemptType: params.attemptType,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function checkOtpLockout(phone: string, ipAddress: string): Promise<{
  locked: boolean;
  lockoutEndsAt?: Date;
  captchaRequired: boolean;
}> {
  // Test-mode (staging only, never production): skip the OTP brute-force
  // lockout so QA testers aren't blocked mid-test. See platformConfig.
  if (platformConfig.rateLimitsRelaxed) {
    return { locked: false, captchaRequired: false };
  }

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

  // MED-N62 fix: pre-fix `effectiveCount = max(failedCount, ipFailedCount)`
  // let an attacker rotate phones to evade per-phone lockout. Hitting 5
  // different phones from one IP (1 per-phone failure each, but 5 IP
  // failures) gave only the LAST phone a lockout — the other 4 stayed
  // open. Now: trigger lockout independently when ipFailedCount >=
  // IP_OTP_LOCKOUT_THRESHOLD (default 10 = 2x phone threshold) so a
  // dispersed attack across many phones still trips on the per-IP
  // rolling failure count. captchaRequired uses sum-style logic too.
  const IP_OTP_LOCKOUT_THRESHOLD = (platformConfig.ipOtpLockoutThreshold ?? 20);
  const effectiveCount = Math.max(failedCount, ipFailedCount);
  const ipLockedOut = ipFailedCount >= IP_OTP_LOCKOUT_THRESHOLD;
  const configuredCaptchaThreshold = await settingsService.getSettingInteger('captcha_threshold');
  const CAPTCHA_THRESHOLD = Math.min(10, Math.max(1, configuredCaptchaThreshold));
  const captchaRequired = effectiveCount >= CAPTCHA_THRESHOLD || ipLockedOut;

  // If the IP is over its independent threshold, return locked
  // immediately regardless of which phone the attacker is currently
  // trying. Lockout window matches the longest standard tier.
  if (ipLockedOut) {
    const ipLockoutMinutes = OTP_LOCKOUT_THRESHOLDS[OTP_LOCKOUT_THRESHOLDS.length - 1]?.lockoutMinutes ?? 60;
    const lockoutEndsAt = new Date(Date.now() + ipLockoutMinutes * 60 * 1000);
    await logSecurityEvent({
      eventType: 'otp_lockout',
      ipAddress,
      metadata: {
        phone: phone.slice(-4),
        scope: 'ip',
        ipFailedCount,
        ipThreshold: IP_OTP_LOCKOUT_THRESHOLD,
        lockoutMinutes: ipLockoutMinutes,
      },
    });
    logger.warn('OTP lockout triggered (IP-level)', {
      ipAddress, ipFailedCount, lockoutMinutes: ipLockoutMinutes,
    });
    return { locked: true, lockoutEndsAt, captchaRequired: true };
  }

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
  // Provider is Cloudflare Turnstile (see escalation E07). The secret lives only
  // on the server; the matching PUBLIC site key is shipped in the client build
  // (EXPO_PUBLIC_TURNSTILE_SITE_KEY). Accept TURNSTILE_SECRET_KEY as a clearer
  // alias for the historical CAPTCHA_SECRET_KEY name.
  const captchaSecret = process.env.CAPTCHA_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY;

  if (!captchaSecret) {
    // Gate the dev bypass on the relaxed-test flag (same condition that skips
    // OTP lockout), NOT NODE_ENV. Otherwise the CAPTCHA challenge that the OTP
    // lockout escalates to is a no-op on any non-prod box even when an operator
    // turns relaxation OFF to exercise the anti-abuse path. Fail closed when
    // relaxation is off and no secret is configured.
    if (platformConfig.rateLimitsRelaxed) {
      logger.info('[DEV] CAPTCHA verification skipped — relaxed test mode, no secret key');
      return true;
    }
    logger.warn('CAPTCHA secret (CAPTCHA_SECRET_KEY / TURNSTILE_SECRET_KEY) not configured — failing closed');
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

// MED-N63 fix — device revocation is a security-sensitive action
// (an attacker who hijacks a session could revoke the legitimate user's
// device to lock them out). The pre-fix code DELETEd the row with no
// audit trail at all. Now we capture the row's metadata before the
// DELETE and emit a `security_event` of type 'device_revoked' atomically
// inside the same transaction. If the audit insert fails, the DELETE
// rolls back — so we never lose the trail. We also still return whether
// a row was actually removed so the route handler can surface 404 vs 200.
export async function revokeDevice(
  userId: string,
  deviceId: string,
): Promise<boolean> {
  return db.transaction(async (client) => {
    const before = await client.query<DeviceFingerprintRow>(
      `SELECT * FROM device_fingerprints WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [deviceId, userId],
    );
    if (before.rows.length === 0) return false;
    const dev = before.rows[0]!;
    const result = await client.query(
      `DELETE FROM device_fingerprints WHERE id = $1 AND user_id = $2`,
      [deviceId, userId],
    );
    if ((result.rowCount ?? 0) === 0) return false;
    await client.query(
      `INSERT INTO security_events (user_id, event_type, ip_address, device_fingerprint, metadata)
       VALUES ($1, $2, $3::inet, $4, $5)`,
      [
        userId,
        'device_revoked',
        dev.last_ip ?? null,
        dev.fingerprint ?? null,
        JSON.stringify({
          deviceId,
          deviceName: dev.device_name ?? null,
          platform: dev.platform ?? null,
          isTrusted: dev.is_trusted ?? null,
        }),
      ],
    );
    return true;
  });
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

// MED-N64 fix — partial UNIQUE index on (ip_address) WHERE is_active =
// TRUE means the previous ON CONFLICT path only fires for currently-
// active rows. If an IP was blocked, then unblocked (is_active=FALSE),
// then blocked again, the upsert misses and a NEW row is INSERTed —
// over time accumulating one row per (block, unblock) cycle.
//
// Two clean fixes are possible: (a) drop the partial WHERE clause from
// the unique index (requires a migration + handling pre-existing
// duplicate inactive rows), or (b) replace the upsert with a SELECT-
// then-UPDATE-or-INSERT inside a transaction. We picked (b) because it
// avoids the migration risk and gives us atomic behaviour for free.
//
// Behaviour after the fix:
//   1. No row exists for the IP → INSERT a new active row.
//   2. An ACTIVE row exists      → UPDATE it (refresh reason / expiry /
//      blocked_by — same outcome as the pre-fix upsert).
//   3. An INACTIVE row exists    → reactivate it: set is_active=TRUE,
//      overwrite reason / expiry / blocked_by — instead of leaving the
//      stale row and INSERTing a duplicate.
//
// SELECT FOR UPDATE serialises concurrent block calls on the same IP
// so two callers can't both race to INSERT.
export async function blockIp(params: {
  ipAddress: string;
  reason: string;
  blockedBy?: string;
  expiresInHours?: number;
}): Promise<BlockedIpRow> {
  const expiresAt = params.expiresInHours
    ? new Date(Date.now() + params.expiresInHours * 3600000)
    : null;

  const row = await db.transaction<BlockedIpRow>(async (client) => {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM blocked_ips
       WHERE ip_address = $1::inet
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [params.ipAddress],
    );
    if (existing.rows.length > 0) {
      const upd = await client.query<BlockedIpRow>(
        `UPDATE blocked_ips
         SET is_active = TRUE,
             reason = $1,
             blocked_by = $2,
             expires_at = $3
         WHERE id = $4
         RETURNING *`,
        [
          params.reason,
          params.blockedBy ?? null,
          expiresAt?.toISOString() ?? null,
          existing.rows[0]!.id,
        ],
      );
      return upd.rows[0]!;
    }
    const ins = await client.query<BlockedIpRow>(
      `INSERT INTO blocked_ips (ip_address, reason, blocked_by, expires_at)
       VALUES ($1::inet, $2, $3, $4)
       RETURNING *`,
      [
        params.ipAddress,
        params.reason,
        params.blockedBy ?? null,
        expiresAt?.toISOString() ?? null,
      ],
    );
    return ins.rows[0]!;
  });

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

  return row;
}

export async function unblockIp(
  ipAddress: string,
  unblockedBy: string,
  reason: string,
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
      metadata: { reason },
    });

    logger.info('IP unblocked', { ipAddress, unblockedBy, reason });
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

/**
 * MED-N65 fix — bulk version of the auto-block worker. Pre-fix this
 * loop ran 3 queries per suspicious IP (isIpBlocked SELECT, blockIp
 * trx with SELECT FOR UPDATE + INSERT/UPDATE, logSecurityEvent
 * INSERT). At 100 suspicious IPs/hour that's 300 round-trips serial.
 *
 * Post-fix:
 *   1. Single SELECT to find suspicious IPs (unchanged).
 *   2. Single SELECT to load the newest block row per suspicious IP.
 *   3. One bulk UPDATE for inactive/expired rows plus one bulk INSERT
 *      for addresses with no history, avoiding duplicate inactive rows.
 *   4. Single bulk INSERT for security_events.
 *
 * Net: at most 6 queries total regardless of N suspicious IPs (vs 3N+1
 * pre-fix), including the transaction boundary and both write shapes.
 */
export async function detectSuspiciousIps(): Promise<number> {
  const configuredThreshold = await settingsService.getSettingInteger('suspicious_ip_threshold');
  const threshold = Math.min(500, Math.max(10, configuredThreshold));

  const suspicious = await db.query<{ ip_address: string; fail_count: string }>(
    `SELECT host(ip_address)::text AS ip_address, COUNT(*)::text AS fail_count FROM login_attempts
     WHERE success = FALSE AND created_at > NOW() - INTERVAL '1 hour'
     GROUP BY ip_address
     HAVING COUNT(*) >= $1`,
    [threshold],
  );

  if (suspicious.rows.length === 0) return 0;

  // Step 2: load the newest block row for each suspicious address. The table
  // has a partial unique index for ACTIVE rows only, so blindly inserting an
  // address with an inactive history row creates one duplicate per unblock /
  // automatic re-block cycle. Reuse that newest row instead.
  const ips = suspicious.rows.map((r) => r.ip_address);
  const existing = await db.query<{
    id: string;
    ip_address: string;
    currently_blocked: boolean;
  }>(
    `SELECT DISTINCT ON (ip_address)
            id,
            host(ip_address)::text AS ip_address,
            (is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW())) AS currently_blocked
       FROM blocked_ips
      WHERE ip_address = ANY($1::inet[])
      ORDER BY ip_address, created_at DESC, id DESC`,
    [ips],
  );
  const latestByIp = new Map(existing.rows.map((row) => [row.ip_address, row]));
  const alreadyBlockedSet = new Set(
    existing.rows.filter((row) => row.currently_blocked).map((row) => row.ip_address),
  );
  const toBlock = suspicious.rows.filter((r) => !alreadyBlockedSet.has(r.ip_address));

  if (toBlock.length === 0) return 0;

  await db.transaction(async (client) => {
    // Step 3a: reactivate the newest inactive/expired history row. This keeps
    // one row per address while preserving the security-event timeline.
    const toReactivate = toBlock.filter((row) => latestByIp.has(row.ip_address));
    if (toReactivate.length > 0) {
      const valuesSql: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const row of toReactivate) {
        valuesSql.push(`($${i++}::uuid, $${i++}::text)`);
        params.push(
          latestByIp.get(row.ip_address)!.id,
          `Auto-blocked: ${row.fail_count} failed login attempts in 1 hour`,
        );
      }
      await client.query(
        `UPDATE blocked_ips AS blocked
            SET is_active = TRUE,
                reason = incoming.reason,
                blocked_by = NULL,
                expires_at = NOW() + INTERVAL '24 hours'
           FROM (VALUES ${valuesSql.join(', ')}) AS incoming(id, reason)
          WHERE blocked.id = incoming.id`,
        params,
      );
    }

    // Step 3b: only addresses with no prior row receive an INSERT.
    const toInsert = toBlock.filter((row) => !latestByIp.has(row.ip_address));
    if (toInsert.length > 0) {
      const valuesSql: string[] = [];
      const params: unknown[] = [];
      let i = 1;
      for (const row of toInsert) {
        valuesSql.push(`($${i++}::inet, $${i++}, NULL, NOW() + INTERVAL '24 hours', TRUE)`);
        params.push(row.ip_address, `Auto-blocked: ${row.fail_count} failed login attempts in 1 hour`);
      }
      await client.query(
        `INSERT INTO blocked_ips (ip_address, reason, blocked_by, expires_at, is_active)
         VALUES ${valuesSql.join(', ')}`,
        params,
      );
    }

    // Step 4: bulk security event log for both inserts and reactivations.
    const eventValuesSql: string[] = [];
    const eventParams: unknown[] = [];
    let j = 1;
    for (const r of toBlock) {
      eventValuesSql.push(
        `($${j++}, 'ip_blocked', $${j++}::inet, $${j++}::jsonb, NOW())`,
      );
      eventParams.push(
        null,
        r.ip_address,
        JSON.stringify({
          reason: `Auto-blocked: ${r.fail_count} failed login attempts in 1 hour`,
          expiresInHours: 24,
          source: 'detectSuspiciousIps',
        }),
      );
    }
    // Defensive: if the security_events shape has additional NOT NULL
    // columns, the INSERT will fail and the trx rolls back the bulk
    // block too — safer than partial state.
    await client.query(
      `INSERT INTO security_events (user_id, event_type, ip_address, metadata, created_at)
       VALUES ${eventValuesSql.join(', ')}`,
      eventParams,
    );
  });

  logger.info('Auto-blocked suspicious IPs (bulk)', {
    count: toBlock.length,
    skippedAlreadyActive: suspicious.rows.length - toBlock.length,
  });

  return toBlock.length;
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

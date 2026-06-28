import crypto from 'node:crypto';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { platformConfig } from '../config/platform.config';
import { neutralizeCsvFormula } from '../utils/csv';

// --- Interfaces ---

interface DataExportRow {
  id: string;
  user_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'expired';
  format: 'json' | 'csv';
  file_url: string | null;
  file_size_bytes: number | null;
  completed_at: Date | null;
  expires_at: Date | null;
  error_message: string | null;
  created_at: Date;
}

interface AccountDeletionRow {
  id: string;
  user_id: string;
  status: 'pending' | 'cooling_off' | 'processing' | 'completed' | 'cancelled';
  reason: string | null;
  requested_at: Date;
  cooling_off_ends_at: Date;
  processed_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

const COOLING_OFF_DAYS = 30;
const EXPORT_EXPIRY_DAYS = 7;

// --- Data Export ---

export async function requestDataExport(
  userId: string,
  format: 'json' | 'csv' = 'json',
): Promise<DataExportRow> {
  const pending = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM data_export_requests
     WHERE user_id = $1 AND status IN ('pending', 'processing')`,
    [userId],
  );

  if (Number(pending.rows[0]?.count ?? 0) > 0) {
    throw createAppError('You already have a pending data export request.', 409);
  }

  const result = await db.query<DataExportRow>(
    `INSERT INTO data_export_requests (user_id, format)
     VALUES ($1, $2)
     RETURNING *`,
    [userId, format],
  );

  logger.info('Data export requested', { userId, format });
  return result.rows[0]!;
}

export async function getDataExportStatus(
  userId: string,
): Promise<DataExportRow[]> {
  const result = await db.query<DataExportRow>(
    `SELECT * FROM data_export_requests
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 10`,
    [userId],
  );
  return result.rows;
}

export async function processDataExport(exportId: string): Promise<void> {
  const exportReq = await db.query<DataExportRow>(
    `UPDATE data_export_requests SET status = 'processing'
     WHERE id = $1 AND status = 'pending'
     RETURNING *`,
    [exportId],
  );

  if (exportReq.rows.length === 0) {
    logger.warn('Data export not found or already processing', { exportId });
    return;
  }

  const req = exportReq.rows[0]!;

  try {
    const exportData = await gatherUserData(req.user_id);
    const serialized = req.format === 'json'
      ? JSON.stringify(exportData, null, 2)
      : convertToCsv(exportData);

    const fileSizeBytes = Buffer.byteLength(serialized, 'utf-8');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + EXPORT_EXPIRY_DAYS);

    // CRIT-N07 fix: actually upload the export to S3 instead of marking
    // the row "completed" with a NULL file_url (NPC RA 10173 right to
    // data portability requires real delivery within 15 days; the
    // pre-fix flow shipped nothing).
    //
    // Reuses the existing uploadBirDocument helper (S3 + AES256 SSE).
    // Returns null in dev/test where AWS_S3_BUCKET / AWS_REGION are
    // unset; in that case we still mark complete but with file_url=NULL
    // so callers can detect the un-configured state.
    const { uploadBirDocument } = await import('../utils/s3-bir');
    const buffer = Buffer.from(serialized, 'utf-8');
    const ext = req.format === 'json' ? 'json' : 'csv';
    const contentType = req.format === 'json' ? 'application/json' : 'text/csv';
    const s3Key = `data-exports/${req.user_id}/${exportId}.${ext}`;
    const uploaded = await uploadBirDocument(buffer, s3Key, contentType);
    const fileUrl = uploaded?.url ?? null;

    if (fileUrl === null && process.env.NODE_ENV === 'production') {
      // Failing closed in production: better to mark failed than to
      // tell the customer their export is "complete" with no file.
      throw new Error('S3 not configured — cannot deliver data export in production');
    }

    await db.query(
      `UPDATE data_export_requests
       SET status = 'completed',
           file_url = $2,
           file_size_bytes = $3,
           completed_at = NOW(),
           expires_at = $4
       WHERE id = $1`,
      [exportId, fileUrl, fileSizeBytes, expiresAt.toISOString()],
    );

    logger.info('Data export completed', {
      exportId,
      userId: req.user_id,
      sizeBytes: fileSizeBytes,
      hasFileUrl: fileUrl !== null,
    });
  } catch (err) {
    await db.query(
      `UPDATE data_export_requests
       SET status = 'failed', error_message = $2
       WHERE id = $1`,
      [exportId, err instanceof Error ? err.message : 'Unknown error'],
    );

    logger.error('Data export failed', {
      exportId,
      error: err instanceof Error ? err.message : 'Unknown',
    });
  }
}

async function gatherUserData(userId: string): Promise<Record<string, unknown>> {
  const [userResult, addressResult, bookingResult, reviewResult, walletResult, messageResult] =
    await Promise.all([
      db.query(
        `SELECT id, phone, email, first_name, last_name, role, avatar_url,
                is_verified, created_at, updated_at
         FROM users WHERE id = $1`,
        [userId],
      ),
      db.query(
        `SELECT id, label, full_address, barangay, city, province, latitude, longitude,
                is_default, created_at
         FROM user_addresses WHERE user_id = $1
         ORDER BY created_at`,
        [userId],
      ),
      db.query(
        `SELECT id, category_id, subcategory_id, booking_type, status,
                service_price, service_fee, total_amount, description,
                address, barangay, city, province, scheduled_at,
                completed_at, created_at
         FROM bookings WHERE customer_id = $1
         ORDER BY created_at`,
        [userId],
      ),
      db.query(
        `SELECT id, booking_id, rating, quality_rating,
                punctuality_rating, professionalism_rating,
                communication_rating, value_rating, comment, created_at
         FROM reviews WHERE reviewer_id = $1
         ORDER BY created_at`,
        [userId],
      ),
      db.query(
        `SELECT w.id, w.type, w.available_balance, w.created_at,
                (SELECT json_agg(json_build_object(
                  'id', wt.id, 'type', wt.type, 'amount', wt.amount,
                  'description', wt.description, 'createdAt', wt.created_at
                ) ORDER BY wt.created_at DESC)
                FROM wallet_transactions wt WHERE wt.wallet_id = w.id
                ) AS transactions
         FROM wallets w WHERE w.user_id = $1`,
        [userId],
      ),
      db.query(
        `SELECT m.id, c.booking_id, m.content, m.message_type, m.created_at
         FROM messages m
         INNER JOIN conversations c ON m.conversation_id = c.id
         WHERE m.sender_id = $1
         ORDER BY m.created_at
         LIMIT 5000`,
        [userId],
      ),
    ]);

  return {
    exportDate: new Date().toISOString(),
    user: userResult.rows[0] ?? null,
    addresses: addressResult.rows,
    bookings: bookingResult.rows,
    reviews: reviewResult.rows,
    wallets: walletResult.rows,
    messages: messageResult.rows,
  };
}

function convertToCsv(data: Record<string, unknown>): string {
  const sections: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === 'exportDate') continue;
    if (!Array.isArray(value) || value.length === 0) continue;

    const rows = value as Record<string, unknown>[];
    const headers = Object.keys(rows[0]!);
    const escapeCell = (raw: string): string => {
      // Neutralize formula triggers before the comma/quote/newline quoting.
      const str = neutralizeCsvFormula(raw);
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };
    const csvRows = rows.map((row) =>
      headers.map((h) => {
        const val = row[h];
        return escapeCell(val === null || val === undefined ? '' : String(val));
      }).join(','),
    );

    sections.push(`--- ${key} ---`);
    sections.push(headers.map(escapeCell).join(','));
    sections.push(...csvRows);
    sections.push('');
  }

  return sections.join('\n');
}

export async function expireOldExports(): Promise<number> {
  const result = await db.query(
    `UPDATE data_export_requests SET status = 'expired'
     WHERE status = 'completed' AND expires_at <= NOW()`,
  );

  const count = result.rowCount ?? 0;
  if (count > 0) {
    logger.info('Expired stale data export files', { count });
  }
  return count;
}

// --- Account Deletion ---

export async function requestAccountDeletion(
  userId: string,
  reason?: string,
): Promise<AccountDeletionRow> {
  const existing = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM account_deletion_requests
     WHERE user_id = $1 AND status IN ('pending', 'cooling_off', 'processing')`,
    [userId],
  );

  if (Number(existing.rows[0]?.count ?? 0) > 0) {
    throw createAppError('You already have a pending account deletion request.', 409);
  }

  // MED-N55 fix — pre-fix the active-bookings count gave the same
  // generic "complete or cancel" error for every blocking status,
  // including 'in_progress' (provider on-site, work happening). The
  // user couldn't act on that bucket — only the auto-confirm timer
  // would clear it. Surface a more specific error so the user knows
  // the wait is automatic and not their fault.
  //
  // We split into two buckets:
  //   - cancellable: customer/provider CAN cancel via the booking flow
  //     (pending, matched, etc.) — friendly "complete or cancel" error.
  //   - in-progress / completed-by-provider: only the auto-confirm
  //     window will resolve. Tell the user to come back after.
  const blockingBookings = await db.query<{ id: string; status: string; scheduled_at: Date | null }>(
    `SELECT id, status, scheduled_at FROM bookings
     WHERE (customer_id = $1 OR provider_id = (SELECT id FROM providers WHERE user_id = $1))
       AND status NOT IN ('confirmed', 'payout_ready', 'paid_out',
                          'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin')
     ORDER BY scheduled_at ASC NULLS LAST
     LIMIT 5`,
    [userId],
  );

  if (blockingBookings.rows.length > 0) {
    const inProgress = blockingBookings.rows.filter(
      (r) => r.status === 'in_progress' || r.status === 'completed_by_provider',
    );
    if (inProgress.length > 0 && inProgress.length === blockingBookings.rows.length) {
      // ALL blockers are in-progress / awaiting confirmation. The user
      // can't manually act; auto-confirm will resolve.
      throw createAppError(
        `Cannot delete account: ${inProgress.length} booking${inProgress.length === 1 ? '' : 's'} ` +
        `${inProgress.length === 1 ? 'is' : 'are'} still in progress and will auto-complete soon. ` +
        `Please request deletion again afterward.`,
        409,
      );
    }
    // At least one cancellable booking present — original message.
    throw createAppError(
      'Cannot delete account while you have active bookings. Please complete or cancel them first.',
      409,
    );
  }

  // MED-N56 fix: also block deletion when an unresolved dispute is
  // open against the user. Anonymizing during a live dispute would
  // resolve the dispute against an anonymized actor — admin can't
  // contact, customer/provider can't follow up.
  const activeDisputes = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM disputes d
     JOIN bookings b ON b.id = d.booking_id
     WHERE (b.customer_id = $1 OR b.provider_id = (SELECT id FROM providers WHERE user_id = $1))
       AND d.status NOT IN ('resolved')`,
    [userId],
  );
  if (Number(activeDisputes.rows[0]?.count ?? 0) > 0) {
    throw createAppError(
      'Cannot delete account while you have an unresolved dispute. Please wait for the dispute to be resolved.',
      409,
    );
  }

  // MED-N52 fix: also check pending_balance (escrow holds). Pre-fix
  // only checked available_balance — a provider with money held in
  // escrow could request deletion and lose access to those funds
  // when the cooling-off period ended (anonymized account can't
  // withdraw).
  const walletBalances = await db.query<{ available: string; pending: string }>(
    `SELECT COALESCE(SUM(available_balance), 0)::text AS available,
            COALESCE(SUM(pending_balance), 0)::text AS pending
     FROM wallets WHERE user_id = $1`,
    [userId],
  );
  const availBal = Number(walletBalances.rows[0]?.available ?? 0);
  const pendBal = Number(walletBalances.rows[0]?.pending ?? 0);

  if (availBal > 0) {
    throw createAppError(
      'Please withdraw your wallet balance before requesting account deletion.',
      409,
    );
  }
  if (pendBal > 0) {
    throw createAppError(
      'Cannot delete account while you have funds held in escrow. Please wait for in-flight bookings to complete and withdraw the released funds first.',
      409,
    );
  }

  const coolingOffEndsAt = new Date();
  coolingOffEndsAt.setDate(coolingOffEndsAt.getDate() + COOLING_OFF_DAYS);

  const result = await db.query<AccountDeletionRow>(
    `INSERT INTO account_deletion_requests
       (user_id, status, reason, cooling_off_ends_at)
     VALUES ($1, 'cooling_off', $2, $3)
     RETURNING *`,
    [userId, reason ?? null, coolingOffEndsAt.toISOString()],
  );

  logger.info('Account deletion requested', {
    userId,
    coolingOffEndsAt: coolingOffEndsAt.toISOString(),
  });

  return result.rows[0]!;
}

export async function cancelAccountDeletion(
  userId: string,
): Promise<void> {
  // MED-N54 fix: also check cooling_off_ends_at > NOW() so a user
  // can't cancel after the cooling-off has elapsed and the
  // processExpiredCoolingOff cron is about to flip the row to
  // 'processing'. Race-window prevention.
  const result = await db.query(
    `UPDATE account_deletion_requests
     SET status = 'cancelled', cancelled_at = NOW()
     WHERE user_id = $1
       AND status IN ('pending', 'cooling_off')
       AND cooling_off_ends_at > NOW()`,
    [userId],
  );

  if ((result.rowCount ?? 0) === 0) {
    throw createAppError(
      'No active deletion request found, or the cooling-off window has already elapsed.',
      404,
    );
  }

  logger.info('Account deletion cancelled', { userId });
}

export async function getAccountDeletionStatus(
  userId: string,
): Promise<AccountDeletionRow | null> {
  const result = await db.query<AccountDeletionRow>(
    `SELECT * FROM account_deletion_requests
     WHERE user_id = $1 AND status IN ('pending', 'cooling_off', 'processing')
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function processExpiredCoolingOff(): Promise<number> {
  const expired = await db.query<AccountDeletionRow>(
    `UPDATE account_deletion_requests
     SET status = 'processing'
     WHERE status = 'cooling_off' AND cooling_off_ends_at <= NOW()
     RETURNING *`,
  );

  let processed = 0;

  // SAFE-N+1: anonymizeUser is an essential GDPR-grade multi-table cascade
  // (UPDATE users + DELETE addresses/push_tokens/refresh_tokens + UPDATE
  // reviews/messages + provider rollback). A true bulk rewrite would (a)
  // trade per-row resilience for batch-abort on a single phone/email UNIQUE
  // collision, and (b) require generating per-user anonymized phone/email
  // arrays in JS to preserve the unique-constraint contract. Volume is
  // bounded: daily cron over a 30-day cooling-off window with low expected
  // throughput. Queue-based async worker is tracked as future work in
  // LAUNCH-LIMITATIONS section 17.
  for (const req of expired.rows) { // SAFE-N+1: bounded daily cron over 30-day cooling-off window with low expected throughput; per-user anonymization required for unique-constraint contract; queue-based async worker tracked in LAUNCH-LIMITATIONS section 17.
    try {
      await anonymizeUser(req.user_id);

      await db.query(
        `UPDATE account_deletion_requests
         SET status = 'completed', processed_at = NOW()
         WHERE id = $1`,
        [req.id],
      );

      processed++;
      logger.info('Account deletion completed - user anonymized', { userId: req.user_id });
    } catch (err) {
      logger.error('Account deletion failed', {
        requestId: req.id,
        userId: req.user_id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  return processed;
}

async function anonymizeUser(userId: string): Promise<void> {
  // CRIT-N08 fix: NPC RA 10173 anonymization is now atomic.
  //
  // Pre-fix: 7 separate top-level db.query calls. If any one failed (DB
  // blip, statement timeout, FK constraint), the user was left in a
  // half-anonymized state — addresses gone, push tokens deleted, but
  // reviews/messages might still hold their name; OR — worse — the
  // refresh_tokens delete might not have run, meaning the "deleted"
  // user's old session remained valid for up to the JWT refresh window.
  //
  // Post-fix: single db.transaction. ORDER MATTERS — delete refresh
  // tokens FIRST so any in-flight session is invalidated before we
  // touch user data. If anything later in the cascade fails, the
  // transaction rolls back and the cron picks up the same row again
  // next run. The phone/email anonymization uses crypto.randomUUID()
  // for collision-resistance instead of Date.now() (was unsafe under
  // concurrent retries).
  await db.transaction(async (client) => {
    // Delete refresh tokens FIRST. If anything later in the cascade
    // fails and the trx rolls back, the user's session is still
    // present — the cron retries naturally next run.
    await client.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1`,
      [userId],
    );

    // Use crypto.randomUUID() for the anonymized phone/email so two
    // simultaneous deletions don't collide on UNIQUE constraints.
    // Phone format keeps the +63 prefix and uses 10 digits derived
    // from the UUID hex (PH numbering plan: +63 + 10).
    const uuid = crypto.randomUUID().replace(/-/g, '');
    const anonymizedPhone = '+63' + uuid.slice(0, 10).replace(/[a-f]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 49)); // a→0, b→1, ..., f→5; ascii 'a'(97) - 49 = '0'(48)
    const anonymizedEmail = `deleted_${uuid}@anonymized.onservice.ph`;

    await client.query(
      `UPDATE users SET
         first_name = 'Deleted',
         last_name = 'User',
         phone = $2,
         email = $3,
         avatar_url = NULL,
         is_active = FALSE,
         updated_at = NOW()
       WHERE id = $1`,
      [userId, anonymizedPhone, anonymizedEmail],
    );

    await client.query(
      `DELETE FROM user_addresses WHERE user_id = $1`,
      [userId],
    );

    await client.query(
      `DELETE FROM push_tokens WHERE user_id = $1`,
      [userId],
    );

    await client.query(
      `UPDATE reviews SET comment = '' WHERE reviewer_id = $1`,
      [userId],
    );

    await client.query(
      `UPDATE messages SET content = '[deleted]' WHERE sender_id = $1`,
      [userId],
    );

    const providerResult = await client.query<{ id: string }>(
      `SELECT id FROM providers WHERE user_id = $1`,
      [userId],
    );

    if (providerResult.rows.length > 0) {
      const providerId = providerResult.rows[0]!.id;

      await client.query(
        `UPDATE providers SET
           business_name = 'Deleted Provider',
           description = '',
           nbi_clearance_url = NULL,
           status = 'deactivated',
           updated_at = NOW()
         WHERE id = $1`,
        [providerId],
      );

      await client.query(
        `UPDATE provider_services SET is_active = FALSE WHERE provider_id = $1`,
        [providerId],
      );
    }
  });
}

// --- Admin Queries ---

export async function listDataExportRequests(
  page = 1,
  pageSize = 20,
  status?: string,
): Promise<{ items: DataExportRow[]; total: number }> {
  const safePageSize = Math.min(pageSize, platformConfig.maxPageSize);
  const offset = (page - 1) * safePageSize;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`d.status = $${paramIndex++}`);
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    db.query<DataExportRow>(
      `SELECT d.* FROM data_export_requests d
       ${whereClause}
       ORDER BY d.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, safePageSize, offset],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM data_export_requests d ${whereClause}`,
      params,
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function listAccountDeletionRequests(
  page = 1,
  pageSize = 20,
  status?: string,
): Promise<{ items: AccountDeletionRow[]; total: number }> {
  const safePageSize = Math.min(pageSize, platformConfig.maxPageSize);
  const offset = (page - 1) * safePageSize;
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (status) {
    conditions.push(`d.status = $${paramIndex++}`);
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [dataResult, countResult] = await Promise.all([
    db.query<AccountDeletionRow>(
      `SELECT d.* FROM account_deletion_requests d
       ${whereClause}
       ORDER BY d.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, safePageSize, offset],
    ),
    db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM account_deletion_requests d ${whereClause}`,
      params,
    ),
  ]);

  return {
    items: dataResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getPendingExportCount(): Promise<number> {
  const result = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM data_export_requests WHERE status = 'pending'`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

// --- Formatters ---

export function formatDataExport(d: DataExportRow): Record<string, unknown> {
  return {
    id: d.id,
    userId: d.user_id,
    status: d.status,
    format: d.format,
    fileUrl: d.file_url,
    fileSizeBytes: d.file_size_bytes,
    completedAt: d.completed_at,
    expiresAt: d.expires_at,
    errorMessage: d.error_message,
    createdAt: d.created_at,
  };
}

export function formatAccountDeletion(d: AccountDeletionRow): Record<string, unknown> {
  return {
    id: d.id,
    userId: d.user_id,
    status: d.status,
    reason: d.reason,
    requestedAt: d.requested_at,
    coolingOffEndsAt: d.cooling_off_ends_at,
    processedAt: d.processed_at,
    cancelledAt: d.cancelled_at,
    createdAt: d.created_at,
  };
}

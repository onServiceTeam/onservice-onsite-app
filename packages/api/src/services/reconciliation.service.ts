/**
 * Phase 08 — Daily money reconciliation service.
 *
 * Computes a snapshot of the platform's cash position by summing every
 * wallet bucket (platform_escrow, platform_revenue, guarantee_fund, all
 * user wallets) and — if a PayMongo balance is provided by the caller —
 * comparing it against the on-platform expected total. A signed
 * discrepancy outside ALERT_THRESHOLD_CENTAVOS is flagged on the row and
 * logged at error level so an external sink can pick it up. Actual
 * outbound dispatch (Slack/email) is intentionally deferred — the DB
 * flag + structured error log IS the alert.
 *
 * Money conservation note: this service NEVER mutates wallet balances.
 * It is read-only against `wallets` and append-only to
 * `reconciliation_snapshots` + `admin_actions`.
 */

import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface ReconciliationSnapshot {
  id: string;
  snapshotDate: string;
  paymongoBalance: number | null;
  platformEscrowTotal: number;
  platformRevenueTotal: number;
  guaranteeFundTotal: number;
  sumOfUserWallets: number;
  expectedTotal: number;
  discrepancy: number;
  discrepancyAlertSent: boolean;
  notes: string | null;
  createdAt: string;
}

export interface RunReconciliationInput {
  snapshotDate?: string;
  paymongoBalance?: number | null;
  notes?: string | null;
  adminUserId?: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

/** Centavos. |discrepancy| above this triggers an alert (P100). */
export const ALERT_THRESHOLD_CENTAVOS = 10_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 365;
const ACK_NOTE_MIN = 5;
const ACK_NOTE_MAX = 1000;

// ─────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────

/** Returns today's date in Asia/Manila (PHT) as YYYY-MM-DD. */
function todayInManila(): string {
  // 'en-CA' formats as YYYY-MM-DD which matches the SQL DATE format.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(
    new Date(),
  );
}

interface SnapshotRow {
  id: string;
  snapshot_date: Date | string;
  paymongo_balance: string | number | null;
  platform_escrow_total: string | number;
  platform_revenue_total: string | number;
  guarantee_fund_total: string | number;
  sum_of_user_wallets: string | number;
  expected_total: string | number;
  discrepancy: string | number;
  discrepancy_alert_sent: boolean;
  notes: string | null;
  created_at: Date;
}

function snapshotDateToString(value: Date | string): string {
  if (typeof value === 'string') {
    // Postgres DATE may already arrive as a YYYY-MM-DD string.
    if (DATE_RE.test(value)) return value;
    const parsed = new Date(value);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(parsed);
  }
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).format(value);
}

function mapSnapshotRow(row: Record<string, unknown>): ReconciliationSnapshot {
  const r = row as unknown as SnapshotRow;
  return {
    id: r.id,
    snapshotDate: snapshotDateToString(r.snapshot_date),
    paymongoBalance:
      r.paymongo_balance === null || r.paymongo_balance === undefined
        ? null
        : Number(r.paymongo_balance),
    platformEscrowTotal: Number(r.platform_escrow_total),
    platformRevenueTotal: Number(r.platform_revenue_total),
    guaranteeFundTotal: Number(r.guarantee_fund_total),
    sumOfUserWallets: Number(r.sum_of_user_wallets),
    expectedTotal: Number(r.expected_total),
    discrepancy: Number(r.discrepancy),
    discrepancyAlertSent: Boolean(r.discrepancy_alert_sent),
    notes: r.notes,
    createdAt: r.created_at.toISOString(),
  };
}

function validateSnapshotDate(date: string): void {
  if (!DATE_RE.test(date)) {
    throw createAppError(
      'snapshotDate must be in YYYY-MM-DD format.',
      400,
    );
  }
  // Reject future dates (PHT). Compare as strings since both are YYYY-MM-DD.
  const today = todayInManila();
  if (date > today) {
    throw createAppError('snapshotDate cannot be in the future.', 400);
  }
}

function validateListLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIST_LIMIT;
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIST_LIMIT;
  }
  return Math.min(MAX_LIST_LIMIT, Math.max(1, Math.floor(limit)));
}

async function insertAuditRow(params: {
  adminId: string | null;
  actionType: 'reconciliation_run' | 'reconciliation_alert_acknowledged';
  targetId: string;
  details: Record<string, unknown>;
  reason: string;
}): Promise<void> {
  // admin_actions.admin_id is nullable as of migration 055; we still wrap
  // in try/catch so a constraint or transient DB failure does not roll
  // back the snapshot — the snapshot row itself is the authoritative
  // artifact.
  try {
    await db.query(
      `INSERT INTO admin_actions
         (admin_id, action_type, target_type, target_id, details, reason)
       VALUES ($1, $2, 'reconciliation', $3, $4::jsonb, $5)`,
      [
        params.adminId,
        params.actionType,
        params.targetId,
        JSON.stringify(params.details),
        params.reason,
      ],
    );
  } catch (err) {
    logger.warn('Failed to write admin_actions row for reconciliation', {
      actionType: params.actionType,
      targetId: params.targetId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// Run daily reconciliation
// ─────────────────────────────────────────────────────────────────

export async function runDailyReconciliation(
  input?: RunReconciliationInput,
): Promise<ReconciliationSnapshot> {
  const snapshotDate = input?.snapshotDate ?? todayInManila();
  validateSnapshotDate(snapshotDate);

  const paymongoBalance =
    input?.paymongoBalance === undefined ? null : input.paymongoBalance;
  if (
    paymongoBalance !== null &&
    (!Number.isFinite(paymongoBalance) ||
      !Number.isInteger(paymongoBalance))
  ) {
    throw createAppError(
      'paymongoBalance must be an integer (centavos) or null.',
      400,
    );
  }

  const adminUserId = input?.adminUserId ?? null;
  const callerNote = input?.notes ?? null;

  // 409 if a snapshot already exists for this date.
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM reconciliation_snapshots WHERE snapshot_date = $1`,
    [snapshotDate],
  );
  if (existing.rows.length > 0) {
    throw createAppError(
      `Reconciliation snapshot already exists for ${snapshotDate}.`,
      409,
    );
  }

  // Compute platform-bucket totals (user_id IS NULL for platform wallets).
  const platformTotals = await db.query<{
    type: 'platform_escrow' | 'platform_revenue' | 'guarantee_fund';
    total: string;
  }>(
    `SELECT type,
            COALESCE(SUM(available_balance + pending_balance), 0)::text AS total
       FROM wallets
      WHERE user_id IS NULL
        AND type IN ('platform_escrow', 'platform_revenue', 'guarantee_fund')
      GROUP BY type`,
    [],
  );

  let escrowTotal = 0;
  let revenueTotal = 0;
  let guaranteeTotal = 0;
  for (const row of platformTotals.rows) {
    const total = Number(row.total);
    if (row.type === 'platform_escrow') escrowTotal = total;
    else if (row.type === 'platform_revenue') revenueTotal = total;
    else if (row.type === 'guarantee_fund') guaranteeTotal = total;
  }

  // Sum of all user wallets (customer + provider).
  const userWalletsResult = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(available_balance + pending_balance), 0)::text AS total
       FROM wallets
      WHERE user_id IS NOT NULL`,
    [],
  );
  const sumOfUserWallets = Number(userWalletsResult.rows[0]?.total ?? 0);

  const expectedTotal =
    escrowTotal + revenueTotal + guaranteeTotal + sumOfUserWallets;

  let discrepancy = 0;
  let alertSent = false;
  let computedNote: string | null = callerNote;

  if (paymongoBalance === null) {
    const fallbackNote = 'PayMongo balance unavailable; expected_total only';
    computedNote = callerNote ? `${callerNote} | ${fallbackNote}` : fallbackNote;
  } else {
    discrepancy = paymongoBalance - expectedTotal;
    if (Math.abs(discrepancy) > ALERT_THRESHOLD_CENTAVOS) {
      alertSent = true;
      logger.error('Reconciliation discrepancy exceeds threshold', {
        snapshotDate,
        paymongoBalance,
        expectedTotal,
        discrepancy,
        thresholdCentavos: ALERT_THRESHOLD_CENTAVOS,
        platformEscrowTotal: escrowTotal,
        platformRevenueTotal: revenueTotal,
        guaranteeFundTotal: guaranteeTotal,
        sumOfUserWallets,
      });
    }
  }

  const inserted = await db.query<SnapshotRow>(
    `INSERT INTO reconciliation_snapshots (
        snapshot_date,
        paymongo_balance,
        platform_escrow_total,
        platform_revenue_total,
        guarantee_fund_total,
        sum_of_user_wallets,
        expected_total,
        discrepancy,
        discrepancy_alert_sent,
        notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      snapshotDate,
      paymongoBalance,
      escrowTotal,
      revenueTotal,
      guaranteeTotal,
      sumOfUserWallets,
      expectedTotal,
      discrepancy,
      alertSent,
      computedNote,
    ],
  );

  const snapshotRow = inserted.rows[0];
  if (!snapshotRow) {
    throw createAppError('Failed to insert reconciliation snapshot.', 500);
  }
  const snapshot = mapSnapshotRow(snapshotRow as unknown as Record<string, unknown>);

  await insertAuditRow({
    adminId: adminUserId,
    actionType: 'reconciliation_run',
    targetId: snapshot.id,
    details: {
      snapshotDate: snapshot.snapshotDate,
      paymongoBalance: snapshot.paymongoBalance,
      expectedTotal: snapshot.expectedTotal,
      discrepancy: snapshot.discrepancy,
      alertSent: snapshot.discrepancyAlertSent,
    },
    reason:
      adminUserId === null
        ? 'auto-run by daily reconciliation cron'
        : 'manual reconciliation run',
  });

  logger.info('Reconciliation snapshot created', {
    snapshotId: snapshot.id,
    snapshotDate: snapshot.snapshotDate,
    expectedTotal: snapshot.expectedTotal,
    discrepancy: snapshot.discrepancy,
    alertSent: snapshot.discrepancyAlertSent,
  });

  return snapshot;
}

// ─────────────────────────────────────────────────────────────────
// Acknowledge a discrepancy alert
// ─────────────────────────────────────────────────────────────────

export async function acknowledgeDiscrepancy(
  snapshotId: string,
  ackNote: string,
  adminUserId: string,
): Promise<ReconciliationSnapshot> {
  const trimmedNote = (ackNote ?? '').trim();
  if (trimmedNote.length < ACK_NOTE_MIN || trimmedNote.length > ACK_NOTE_MAX) {
    throw createAppError(
      `ackNote length must be between ${ACK_NOTE_MIN} and ${ACK_NOTE_MAX} characters.`,
      400,
    );
  }
  if (!adminUserId || typeof adminUserId !== 'string') {
    throw createAppError('adminUserId is required.', 400);
  }

  const updated = await db.transaction(async (client) => {
    const current = await client.query<SnapshotRow>(
      `SELECT * FROM reconciliation_snapshots WHERE id = $1 FOR UPDATE`,
      [snapshotId],
    );
    const row = current.rows[0];
    if (!row) {
      throw createAppError('Reconciliation snapshot not found.', 404);
    }
    if (!row.discrepancy_alert_sent) {
      throw createAppError(
        'Snapshot has no active discrepancy alert to acknowledge.',
        409,
      );
    }

    const ackPrefix = `[ack by ${adminUserId} @ ${new Date().toISOString()}] `;
    const appendedNote = row.notes
      ? `${row.notes}\n${ackPrefix}${trimmedNote}`
      : `${ackPrefix}${trimmedNote}`;

    const result = await client.query<SnapshotRow>(
      `UPDATE reconciliation_snapshots
          SET discrepancy_alert_sent = FALSE,
              notes = $2
        WHERE id = $1
        RETURNING *`,
      [snapshotId, appendedNote],
    );
    const updatedRow = result.rows[0];
    if (!updatedRow) {
      throw createAppError(
        'Failed to update reconciliation snapshot.',
        500,
      );
    }
    return updatedRow;
  });

  const snapshot = mapSnapshotRow(updated as unknown as Record<string, unknown>);

  await insertAuditRow({
    adminId: adminUserId,
    actionType: 'reconciliation_alert_acknowledged',
    targetId: snapshot.id,
    details: {
      snapshotDate: snapshot.snapshotDate,
      discrepancy: snapshot.discrepancy,
    },
    reason: trimmedNote,
  });

  logger.info('Reconciliation discrepancy acknowledged', {
    snapshotId: snapshot.id,
    snapshotDate: snapshot.snapshotDate,
    adminUserId,
  });

  return snapshot;
}

// ─────────────────────────────────────────────────────────────────
// Listing / lookup
// ─────────────────────────────────────────────────────────────────

export async function getSnapshotById(
  id: string,
): Promise<ReconciliationSnapshot | null> {
  const result = await db.query<SnapshotRow>(
    `SELECT * FROM reconciliation_snapshots WHERE id = $1`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return mapSnapshotRow(row as unknown as Record<string, unknown>);
}

export async function getSnapshotByDate(
  date: string,
): Promise<ReconciliationSnapshot | null> {
  if (!DATE_RE.test(date)) {
    throw createAppError('date must be in YYYY-MM-DD format.', 400);
  }
  const result = await db.query<SnapshotRow>(
    `SELECT * FROM reconciliation_snapshots WHERE snapshot_date = $1`,
    [date],
  );
  const row = result.rows[0];
  if (!row) return null;
  return mapSnapshotRow(row as unknown as Record<string, unknown>);
}

export async function listRecentSnapshots(
  limit?: number,
): Promise<ReconciliationSnapshot[]> {
  const safeLimit = validateListLimit(limit);
  const result = await db.query<SnapshotRow>(
    `SELECT * FROM reconciliation_snapshots
      ORDER BY snapshot_date DESC
      LIMIT $1`,
    [safeLimit],
  );
  return result.rows.map((r) =>
    mapSnapshotRow(r as unknown as Record<string, unknown>),
  );
}

export async function listAlertedSnapshots(
  limit?: number,
): Promise<ReconciliationSnapshot[]> {
  const safeLimit = validateListLimit(limit);
  const result = await db.query<SnapshotRow>(
    `SELECT * FROM reconciliation_snapshots
      WHERE discrepancy_alert_sent = TRUE
      ORDER BY snapshot_date DESC
      LIMIT $1`,
    [safeLimit],
  );
  return result.rows.map((r) =>
    mapSnapshotRow(r as unknown as Record<string, unknown>),
  );
}

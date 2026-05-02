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

import * as Sentry from '@sentry/node';
import { db } from '../models/db';
import { createAppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';
import { sendSlackAlert } from './slack-alert.service';
// MED-N119 fix — threshold is admin-tunable via platform_settings
// (key: reconciliation_alert_threshold_centavos). Hardcoded fallback
// retained as default. settings service is async + Redis-cached.
import * as settingsService from './settings.service';

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

// MED-N119 fix — admin-tunable via platform_settings.
async function getAlertThresholdCentavos(): Promise<number> {
  try {
    const raw = await settingsService.getSetting('reconciliation_alert_threshold_centavos');
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    // fall through to default
  }
  return ALERT_THRESHOLD_CENTAVOS;
}

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

function mapSnapshotRow(row: SnapshotRow): ReconciliationSnapshot {
  return {
    id: row.id,
    snapshotDate: snapshotDateToString(row.snapshot_date),
    paymongoBalance:
      row.paymongo_balance === null || row.paymongo_balance === undefined
        ? null
        : Number(row.paymongo_balance),
    platformEscrowTotal: Number(row.platform_escrow_total),
    platformRevenueTotal: Number(row.platform_revenue_total),
    guaranteeFundTotal: Number(row.guarantee_fund_total),
    sumOfUserWallets: Number(row.sum_of_user_wallets),
    expectedTotal: Number(row.expected_total),
    discrepancy: Number(row.discrepancy),
    discrepancyAlertSent: Boolean(row.discrepancy_alert_sent),
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
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
  // gate-c-allowed: best-effort-audit-only — snapshot row already durable, audit is paired-but-non-blocking
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

  // MED-N121 fix — atomic snapshot. Pre-fix the platform-bucket SELECT
  // and the user-wallet SELECT were two separate queries against the
  // wallets table; concurrent debit/credit between them produced a
  // discrepancy of exactly the moved amount, looking like real money
  // loss. Post-fix: ONE query with a CASE/COALESCE per bucket so all
  // values come from a single MVCC snapshot.
  const allTotals = await db.query<{
    platform_escrow_total: string;
    platform_revenue_total: string;
    guarantee_fund_total: string;
    user_wallets_total: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN user_id IS NULL AND type = 'platform_escrow'
                         THEN available_balance + pending_balance ELSE 0 END), 0)::text
         AS platform_escrow_total,
       COALESCE(SUM(CASE WHEN user_id IS NULL AND type = 'platform_revenue'
                         THEN available_balance + pending_balance ELSE 0 END), 0)::text
         AS platform_revenue_total,
       COALESCE(SUM(CASE WHEN user_id IS NULL AND type = 'guarantee_fund'
                         THEN available_balance + pending_balance ELSE 0 END), 0)::text
         AS guarantee_fund_total,
       COALESCE(SUM(CASE WHEN user_id IS NOT NULL
                         THEN available_balance + pending_balance ELSE 0 END), 0)::text
         AS user_wallets_total
       FROM wallets`,
    [],
  );

  const totalsRow = allTotals.rows[0];
  if (!totalsRow) {
    throw createAppError('Failed to read wallet totals.', 500);
  }
  const escrowTotal = Number(totalsRow.platform_escrow_total);
  const revenueTotal = Number(totalsRow.platform_revenue_total);
  const guaranteeTotal = Number(totalsRow.guarantee_fund_total);
  const sumOfUserWallets = Number(totalsRow.user_wallets_total);

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
    // MED-N119 fix — read threshold from platform_settings (with fallback).
    const thresholdCentavos = await getAlertThresholdCentavos();
    if (Math.abs(discrepancy) > thresholdCentavos) {
      alertSent = true;
      const alertContext = {
        snapshotDate,
        paymongoBalance,
        expectedTotal,
        discrepancy,
        thresholdCentavos,
        platformEscrowTotal: escrowTotal,
        platformRevenueTotal: revenueTotal,
        guaranteeFundTotal: guaranteeTotal,
        sumOfUserWallets,
      };
      logger.error('Reconciliation discrepancy exceeds threshold', alertContext);

      // MED-N120 fix: log + DB-flag is no longer the only alert path.
      // Money-conservation discrepancies need ops eyes within minutes,
      // not when someone next opens the admin dashboard.
      // (a) Sentry capture for the existing alerting integration.
      try {
        Sentry.captureMessage('Reconciliation discrepancy exceeds threshold', {
          level: discrepancy > 0 ? 'warning' : 'error',
          extra: alertContext,
        });
      } catch (sentryErr) {
        logger.warn('Sentry capture failed for reconciliation alert', {
          error: sentryErr instanceof Error ? sentryErr.message : String(sentryErr),
        });
      }
      // (b) Slack alert for direct ops channel posting.
      // Best-effort — sendSlackAlert never throws.
      void sendSlackAlert({
        title: 'Reconciliation discrepancy detected',
        body: `Money-conservation check found a discrepancy of \`${discrepancy}\` centavos on snapshot \`${snapshotDate}\`.`,
        severity: Math.abs(discrepancy) > thresholdCentavos * 10 ? 'critical' : 'error',
        fields: [
          { key: 'PayMongo balance', value: `${paymongoBalance} centavos` },
          { key: 'Expected total', value: `${expectedTotal} centavos` },
          { key: 'Discrepancy', value: `${discrepancy} centavos (threshold ${thresholdCentavos})` },
          { key: 'Platform escrow', value: `${escrowTotal} centavos` },
          { key: 'Platform revenue', value: `${revenueTotal} centavos` },
          { key: 'Guarantee fund', value: `${guaranteeTotal} centavos` },
          { key: 'Sum of user wallets', value: `${sumOfUserWallets} centavos` },
        ],
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
  const snapshot = mapSnapshotRow(snapshotRow);

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

  const snapshot = mapSnapshotRow(updated);

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
  return mapSnapshotRow(row);
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
  return mapSnapshotRow(row);
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
  return result.rows.map((r) => mapSnapshotRow(r)); // SAFE-N+1: in-memory row-to-DTO mapping of LIMIT-bounded recent snapshots; no DB calls inside map.
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
  return result.rows.map((r) => mapSnapshotRow(r)); // SAFE-N+1: in-memory row-to-DTO mapping of LIMIT-bounded alerted snapshots; no DB calls inside map.
}

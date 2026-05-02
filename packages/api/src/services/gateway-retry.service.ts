import { db } from '../models/db';
import { logger } from '../utils/logger';
import * as escrowService from './escrow.service';

/**
 * MED-N28 fix — failed-gateway-action retry queue.
 *
 * When a post-commit gateway call fails (PayMongo refund, escrow
 * release, etc.) the original code path could only logger.error and
 * carry on. The retry queue lets us:
 *   1. Enqueue a row immediately on the failure (caller still
 *      doesn't roll back — the durable state already committed).
 *   2. A scheduled worker picks pending rows up periodically and
 *      retries with exponential backoff.
 *   3. After max_attempts (default 5) the row is marked
 *      'failed_permanent' and surfaces in the admin UI for manual
 *      ops triage.
 */

export type RetryActionType =
  | 'refund_from_escrow'
  | 'release_escrow'
  | 'release_partial_escrow';

export interface EnqueueRetryInput {
  actionType: RetryActionType;
  bookingId: string;
  disputeId?: string | null;
  amountCentavos?: number | null;
  description?: string | null;
  initialError: string;
}

/**
 * Enqueue a failed gateway action for retry.
 *
 * Best-effort: if the queue insert itself fails, we log the error
 * but DO NOT throw — the caller is in a post-commit error path
 * already and adding another failure would obscure the original.
 * The original logger.error remains the primary record.
 */
export async function enqueueRetry(input: EnqueueRetryInput): Promise<void> {
  try {
    await db.query(
      `INSERT INTO gateway_retry_queue
         (action_type, booking_id, dispute_id, amount_centavos,
          description, attempts, last_error, status)
       VALUES ($1, $2, $3, $4, $5, 0, $6, 'pending')`,
      [
        input.actionType,
        input.bookingId,
        input.disputeId ?? null,
        input.amountCentavos ?? null,
        input.description ?? null,
        input.initialError.slice(0, 2000), // cap to keep DB rows sane
      ],
    );
    logger.info('Enqueued failed gateway action for retry', {
      actionType: input.actionType,
      bookingId: input.bookingId,
      disputeId: input.disputeId ?? undefined,
    });
  } catch (queueErr) {
    logger.error('FAILED to enqueue gateway-retry row (original failure remains the primary record)', {
      actionType: input.actionType,
      bookingId: input.bookingId,
      enqueueError: queueErr instanceof Error ? queueErr.message : String(queueErr),
    });
  }
}

/** Exponential backoff in minutes: attempt N → 2^N minutes from now. */
function backoffMinutes(attempts: number): number {
  return Math.min(2 ** attempts, 120); // cap at 2 hours
}

interface PendingRetryRow {
  id: string;
  action_type: RetryActionType;
  booking_id: string;
  dispute_id: string | null;
  amount_centavos: string | null;
  description: string | null;
  attempts: number;
  max_attempts: number;
}

/**
 * Worker entry point. Pulls all pending rows whose next_retry_at
 * has passed and attempts each. Returns counts for telemetry.
 *
 * Concurrency: the SELECT uses FOR UPDATE SKIP LOCKED so multiple
 * workers can run safely (each grabs a distinct subset).
 */
export async function processRetries(batchSize: number = 25): Promise<{
  attempted: number;
  succeeded: number;
  failedAndRetrying: number;
  failedPermanent: number;
}> {
  const counts = { attempted: 0, succeeded: 0, failedAndRetrying: 0, failedPermanent: 0 };

  // Atomically claim a batch and flip status to 'in_progress' so
  // concurrent workers don't double-process.
  const claimed = await db.query<PendingRetryRow>(
    `UPDATE gateway_retry_queue
        SET status = 'in_progress', last_attempted_at = NOW(), updated_at = NOW()
      WHERE id IN (
        SELECT id FROM gateway_retry_queue
         WHERE status = 'pending'
           AND next_retry_at <= NOW()
         ORDER BY next_retry_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, action_type, booking_id, dispute_id, amount_centavos, description, attempts, max_attempts`,
    [batchSize],
  );

  for (const row of claimed.rows) {
    counts.attempted++;
    try {
      await runOne(row);
      await db.query(
        `UPDATE gateway_retry_queue
            SET status = 'succeeded', succeeded_at = NOW(), updated_at = NOW(),
                attempts = attempts + 1
          WHERE id = $1`,
        [row.id],
      );
      counts.succeeded++;
      logger.info('Gateway retry succeeded', {
        retryId: row.id, actionType: row.action_type, bookingId: row.booking_id,
        attempts: row.attempts + 1,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const nextAttempts = row.attempts + 1;
      if (nextAttempts >= row.max_attempts) {
        await db.query(
          `UPDATE gateway_retry_queue
              SET status = 'failed_permanent', failed_permanent_at = NOW(),
                  updated_at = NOW(), attempts = $1, last_error = $2
            WHERE id = $3`,
          [nextAttempts, errMsg.slice(0, 2000), row.id],
        );
        counts.failedPermanent++;
        logger.error('Gateway retry exhausted max_attempts; FAILED_PERMANENT — manual ops required', {
          retryId: row.id, actionType: row.action_type, bookingId: row.booking_id,
          disputeId: row.dispute_id, attempts: nextAttempts, lastError: errMsg,
        });
      } else {
        const minutes = backoffMinutes(nextAttempts);
        await db.query(
          `UPDATE gateway_retry_queue
              SET status = 'pending',
                  next_retry_at = NOW() + ($1 || ' minutes')::interval,
                  updated_at = NOW(), attempts = $2, last_error = $3
            WHERE id = $4`,
          [String(minutes), nextAttempts, errMsg.slice(0, 2000), row.id],
        );
        counts.failedAndRetrying++;
        logger.warn('Gateway retry failed; rescheduled with backoff', {
          retryId: row.id, actionType: row.action_type, attempts: nextAttempts,
          backoffMinutes: minutes, error: errMsg,
        });
      }
    }
  }

  return counts;
}

async function runOne(row: PendingRetryRow): Promise<void> {
  const amount = row.amount_centavos !== null ? Number(row.amount_centavos) : null;
  switch (row.action_type) {
    case 'refund_from_escrow':
      if (amount === null) throw new Error('refund_from_escrow row missing amount');
      await escrowService.refundFromEscrow(
        row.booking_id,
        amount,
        row.description ?? 'Gateway retry: refund',
      );
      return;
    case 'release_escrow':
      await escrowService.releaseEscrow(row.booking_id);
      return;
    case 'release_partial_escrow':
      if (amount === null) throw new Error('release_partial_escrow row missing amount');
      await escrowService.releasePartialEscrow(row.booking_id, amount);
      return;
    default:
      // TS exhaustiveness; should be unreachable given the CHECK constraint.
      throw new Error(`Unknown retry action_type: ${(row as { action_type: string }).action_type}`);
  }
}

/**
 * Admin Compliance dashboard: list rows that have exhausted retries
 * and need manual ops attention.
 */
export async function listFailedPermanent(limit: number = 50): Promise<Array<{
  id: string;
  actionType: RetryActionType;
  bookingId: string;
  disputeId: string | null;
  amountCentavos: number | null;
  attempts: number;
  lastError: string;
  failedPermanentAt: Date;
}>> {
  const result = await db.query<{
    id: string;
    action_type: RetryActionType;
    booking_id: string;
    dispute_id: string | null;
    amount_centavos: string | null;
    attempts: number;
    last_error: string;
    failed_permanent_at: Date;
  }>(
    `SELECT id, action_type, booking_id, dispute_id, amount_centavos,
            attempts, last_error, failed_permanent_at
       FROM gateway_retry_queue
      WHERE status = 'failed_permanent'
      ORDER BY failed_permanent_at DESC
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((r) => ({
    id: r.id,
    actionType: r.action_type,
    bookingId: r.booking_id,
    disputeId: r.dispute_id,
    amountCentavos: r.amount_centavos !== null ? Number(r.amount_centavos) : null,
    attempts: r.attempts,
    lastError: r.last_error,
    failedPermanentAt: r.failed_permanent_at,
  }));
}

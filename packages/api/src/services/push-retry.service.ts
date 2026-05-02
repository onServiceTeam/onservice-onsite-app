import { db } from '../models/db';
import { logger } from '../utils/logger';

/**
 * MED-N57 fix — push-delivery retry queue.
 *
 * notification.service.deliverPushToDevice talks to the Expo push API.
 * If that call fails as a whole (Expo unreachable, 5xx, rate-limited)
 * the pre-fix code only logger.error()'d and the user never got woken
 * up. The notification ROW exists in DB so the next time they open
 * the app they see it — but a real-time alert ("your provider has
 * arrived") is useless after the fact.
 *
 * Pattern mirrors gateway-retry.service (MED-N28):
 *   1. enqueueRetry inserts a row at the moment of failure.
 *   2. processRetries (worker) pulls pending rows whose next_retry_at
 *      has passed, atomically claims a batch via FOR UPDATE SKIP
 *      LOCKED, retries, and either marks succeeded or schedules the
 *      next attempt with exponential backoff.
 *   3. After max_attempts (5) the row is marked failed_permanent and
 *      surfaces in admin UI for ops triage.
 *
 * Per-ticket failures (DeviceNotRegistered etc.) are NOT enqueued —
 * those mean a stale token and are handled inline by deleting it.
 */

export interface EnqueuePushRetryInput {
  userId: string;
  notificationId?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  initialError: string;
}

export async function enqueuePushRetry(input: EnqueuePushRetryInput): Promise<void> {
  try {
    await db.query(
      `INSERT INTO push_retry_queue
         (user_id, notification_id, title, body, data,
          attempts, last_error, status)
       VALUES ($1, $2, $3, $4, $5, 0, $6, 'pending')`,
      [
        input.userId,
        input.notificationId ?? null,
        input.title.slice(0, 500),
        input.body.slice(0, 2000),
        JSON.stringify(input.data ?? {}),
        input.initialError.slice(0, 2000),
      ],
    );
    logger.info('Enqueued failed push for retry', {
      userId: input.userId,
      notificationId: input.notificationId ?? undefined,
    });
  } catch (queueErr) {
    logger.error('FAILED to enqueue push-retry row (original push failure remains the primary record)', {
      userId: input.userId,
      enqueueError: queueErr instanceof Error ? queueErr.message : String(queueErr),
    });
  }
}

/** Exponential backoff in minutes: attempt N -> 2^N minutes. Cap 2h. */
function backoffMinutes(attempts: number): number {
  return Math.min(2 ** attempts, 120);
}

interface PendingPushRow {
  id: string;
  user_id: string;
  notification_id: string | null;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
}

/**
 * Worker entry point. Takes a `deliver` callback so the worker can
 * call back into notification.service.deliverPushToDevice without
 * creating a circular import (notification.service depends on this
 * file at compile time for enqueueing).
 */
export async function processPushRetries(
  deliver: (
    userId: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
  ) => Promise<void>,
  batchSize: number = 25,
): Promise<{
  attempted: number;
  succeeded: number;
  failedAndRetrying: number;
  failedPermanent: number;
}> {
  const counts = { attempted: 0, succeeded: 0, failedAndRetrying: 0, failedPermanent: 0 };

  const claimed = await db.query<PendingPushRow>(
    `UPDATE push_retry_queue
        SET status = 'in_progress', last_attempted_at = NOW(), updated_at = NOW()
      WHERE id IN (
        SELECT id FROM push_retry_queue
         WHERE status = 'pending'
           AND next_retry_at <= NOW()
         ORDER BY next_retry_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, user_id, notification_id, title, body, data, attempts, max_attempts`,
    [batchSize],
  );

  for (const row of claimed.rows) {
    counts.attempted++;
    try {
      await deliver(
        row.user_id,
        row.title,
        row.body,
        row.data ?? {},
      );
      await db.query(
        `UPDATE push_retry_queue
            SET status = 'succeeded', succeeded_at = NOW(), updated_at = NOW(),
                attempts = attempts + 1
          WHERE id = $1`,
        [row.id],
      );
      counts.succeeded++;
      logger.info('Push retry succeeded', {
        retryId: row.id, userId: row.user_id, attempts: row.attempts + 1,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const nextAttempts = row.attempts + 1;
      if (nextAttempts >= row.max_attempts) {
        await db.query(
          `UPDATE push_retry_queue
              SET status = 'failed_permanent', failed_permanent_at = NOW(),
                  updated_at = NOW(), attempts = $1, last_error = $2
            WHERE id = $3`,
          [nextAttempts, errMsg.slice(0, 2000), row.id],
        );
        counts.failedPermanent++;
        logger.error('Push retry exhausted max_attempts; FAILED_PERMANENT — manual ops required', {
          retryId: row.id, userId: row.user_id, attempts: nextAttempts, lastError: errMsg,
        });
      } else {
        const minutes = backoffMinutes(nextAttempts);
        await db.query(
          `UPDATE push_retry_queue
              SET status = 'pending',
                  next_retry_at = NOW() + ($1 || ' minutes')::interval,
                  updated_at = NOW(), attempts = $2, last_error = $3
            WHERE id = $4`,
          [String(minutes), nextAttempts, errMsg.slice(0, 2000), row.id],
        );
        counts.failedAndRetrying++;
        logger.warn('Push retry failed; rescheduled with backoff', {
          retryId: row.id, userId: row.user_id,
          attempts: nextAttempts, backoffMinutes: minutes, error: errMsg,
        });
      }
    }
  }

  return counts;
}

/**
 * Admin Compliance dashboard: list rows that have exhausted retries
 * and need manual ops attention.
 */
export async function listFailedPermanentPushes(limit: number = 50): Promise<Array<{
  id: string;
  userId: string;
  notificationId: string | null;
  title: string;
  body: string;
  attempts: number;
  lastError: string;
  failedPermanentAt: Date;
}>> {
  const result = await db.query<{
    id: string;
    user_id: string;
    notification_id: string | null;
    title: string;
    body: string;
    attempts: number;
    last_error: string;
    failed_permanent_at: Date;
  }>(
    `SELECT id, user_id, notification_id, title, body,
            attempts, last_error, failed_permanent_at
       FROM push_retry_queue
      WHERE status = 'failed_permanent'
      ORDER BY failed_permanent_at DESC
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    notificationId: r.notification_id,
    title: r.title,
    body: r.body,
    attempts: r.attempts,
    lastError: r.last_error,
    failedPermanentAt: r.failed_permanent_at,
  }));
}

import { db } from '../models/db';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';

export interface EmailLinkCleanupResult { proofsExpired: number; requestsPurged: number }

/** One bounded attempt, not an unbounded drain or account-erasure operation.
 * Only challenge rows are locked, with no subsequent account/identity lock.
 * This cannot invert the account-before-challenge order of linking/deletion.
 * Neither the cutoff nor retention duration can come from a queued payload.
 */
export async function cleanupEmailLinkChallenges(limit = 100): Promise<EmailLinkCleanupResult> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw createAppError('Invalid verification cleanup limit.', 400);
  }
  return db.transaction(async client => {
    const expired = await client.query(`WITH batch AS (
      SELECT id FROM email_link_challenges
       WHERE state='pending' AND expires_at <= statement_timestamp()
       ORDER BY expires_at, id LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE email_link_challenges AS challenge
       SET state='invalidated',phone_code_hash=NULL,email_code_hash=NULL,
           finished_at=clock_timestamp()
      FROM batch WHERE challenge.id=batch.id`, [limit]);
    const purged = await client.query(`WITH batch AS (
      SELECT id FROM email_link_challenges
       WHERE state <> 'pending'
         AND created_at < statement_timestamp() - ($2 * INTERVAL '1 day')
       ORDER BY created_at, id LIMIT $1 FOR UPDATE SKIP LOCKED
    ) DELETE FROM email_link_challenges AS challenge USING batch
       WHERE challenge.id=batch.id`, [limit, platformConfig.emailLinkRequestRetentionDays]);
    // Counts describe actions, not distinct owners. An old abandoned request
    // may be expired and purged in this same transaction. Identity/audit stays.
    return { proofsExpired: expired.rowCount ?? 0, requestsPurged: purged.rowCount ?? 0 };
  });
}

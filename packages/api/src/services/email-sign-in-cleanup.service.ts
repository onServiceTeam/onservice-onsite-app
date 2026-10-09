import { db } from '../models/db';
import { platformConfig } from '../config/platform.config';
import { createAppError } from '../middleware/error.middleware';

/** Bounded internal cleanup, including unowned decoys. Challenge-only locks,
 * no account/identity/session locks and no payload-supplied cutoff. A retry
 * after interruption cannot consume a current proof or erase an identity.
 */
export async function cleanupEmailSignInChallenges(limit = 100): Promise<{
  proofsExpired: number; requestsPurged: number;
}> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw createAppError('Invalid verification cleanup limit.', 400);
  }
  return db.transaction(async client => {
    const expired = await client.query(`WITH batch AS (
      SELECT id FROM email_sign_in_challenges
       WHERE state='pending' AND expires_at <= statement_timestamp()
       ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
    ) UPDATE email_sign_in_challenges AS proof SET state='invalidated',code_hash=NULL,
        finished_at=clock_timestamp() FROM batch WHERE proof.id=batch.id`, [limit]);
    const purged = await client.query(`WITH batch AS (
      SELECT id FROM email_sign_in_challenges WHERE state<>'pending'
        AND created_at < statement_timestamp()-($2*INTERVAL '1 day')
       ORDER BY created_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
    ) DELETE FROM email_sign_in_challenges AS proof USING batch WHERE proof.id=batch.id`,
    [limit, platformConfig.emailSignInRequestRetentionDays]);
    return { proofsExpired: expired.rowCount ?? 0, requestsPurged: purged.rowCount ?? 0 };
  });
}

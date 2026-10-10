// MC-03: guarded dispute fixture on top of the participant fixture. The
// disputes and dispute_evidence tables are the exact DDL of migration 014
// (no later migration alters them). Booking B is completed by provider B,
// with real assignment terms, so customer B can file a dispute and the
// dispute money paths run against the real escrow, wallet and payment
// records. The production booking columns those paths read are added.
import type { Pool } from 'pg';
import { db } from '../../src/models/db';
import { appendProviderAssignmentTermsInTransaction } from '../../src/services/booking-financial-terms.service';
import {
  withParticipantRefundDatabase, bookingB, providerB, providerUserA, providerUserB,
} from './booking-participant-postgres';

export async function withDisputeDatabase(run: (database: Pool) => Promise<void>): Promise<void> {
  await withParticipantRefundDatabase(async database => {
    await database.query(`
      ALTER TABLE bookings ADD COLUMN completed_at timestamptz, ADD COLUMN confirmed_at timestamptz,
        ADD COLUMN provider_suspended_during_booking_at timestamptz;
      CREATE TABLE disputes (
          id UUID PRIMARY KEY DEFAULT uuidv7(),
          booking_id UUID NOT NULL REFERENCES bookings(id),
          filed_by UUID NOT NULL REFERENCES users(id),
          type VARCHAR(30) NOT NULL
              CHECK (type IN ('no_show', 'incomplete', 'substandard', 'damage', 'theft', 'overcharge', 'other')),
          description TEXT NOT NULL,
          status VARCHAR(30) NOT NULL DEFAULT 'open'
              CHECK (status IN ('open', 'under_review', 'escalated', 'resolved')),
          tier SMALLINT NOT NULL DEFAULT 1 CHECK (tier >= 1 AND tier <= 3),
          assigned_to UUID REFERENCES users(id),
          resolution_type VARCHAR(30)
              CHECK (resolution_type IS NULL OR resolution_type IN (
                  'full_refund', 'partial_refund', 'no_refund', 'free_redo',
                  'refund_with_warning', 'refund_with_suspension', 'split_decision'
              )),
          refund_amount BIGINT DEFAULT 0,
          refund_percent DECIMAL(5,2),
          decision_notes TEXT,
          internal_notes TEXT,
          provider_response TEXT,
          provider_responded_at TIMESTAMPTZ,
          auto_resolved BOOLEAN NOT NULL DEFAULT FALSE,
          resolved_at TIMESTAMPTZ,
          resolved_by UUID REFERENCES users(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT valid_resolution CHECK (
              (status != 'resolved') OR (resolution_type IS NOT NULL AND decision_notes IS NOT NULL)
          )
      );
      CREATE TABLE dispute_evidence (
          id UUID PRIMARY KEY DEFAULT uuidv7(),
          dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
          uploaded_by UUID NOT NULL REFERENCES users(id),
          evidence_type VARCHAR(20) NOT NULL
              CHECK (evidence_type IN ('photo', 'video', 'document')),
          file_url TEXT NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_action_type_check;
      ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_action_type_check
        CHECK (action_type IN ('refund_issued','dispute_resolved'));
      ALTER TABLE admin_actions DROP CONSTRAINT admin_actions_target_type_check;
      ALTER TABLE admin_actions ADD CONSTRAINT admin_actions_target_type_check
        CHECK (target_type IN ('booking','dispute'));
    `);
    // Device push stays disabled for the provider accounts too.
    await database.query('INSERT INTO notification_preferences(user_id) VALUES ($1),($2)', [providerUserA, providerUserB]);
    await db.transaction(async client => {
      await client.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });
    // Completed an hour ago, three hours after it was scheduled: inside the
    // dispute window and outside the no-show auto-resolution window.
    await database.query(`UPDATE bookings SET status='completed_by_provider',
        scheduled_at=NOW() - INTERVAL '4 hours', completed_at=NOW() - INTERVAL '1 hour' WHERE id=$1`, [bookingB]);
    await run(database);
  });
}

// Waits until `count` sessions of this fixture, other than the blocker, are
// waiting on a lock. A second waiter often waits behind the first rather than
// on the blocker itself, so count every blocked session.
export async function waitForWaiters(database: Pool, blockerPid: number, count: number): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const waiting = await database.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM pg_stat_activity
        WHERE application_name = current_setting('application_name')
          AND pid <> $1 AND cardinality(pg_blocking_pids(pid)) > 0`, [blockerPid],
    );
    if (Number(waiting.rows[0]?.n ?? 0) >= count) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`Expected ${count} sessions waiting on the blocker.`);
}

export async function bookingEscrowLeft(database: Pool, escrowWalletId: string, bookingId: string): Promise<string> {
  return (await database.query<{ remaining: string }>(`SELECT COALESCE(SUM(amount),0)::text AS remaining
    FROM wallet_transactions WHERE wallet_id=$1 AND booking_id=$2`, [escrowWalletId, bookingId])).rows[0]!.remaining;
}

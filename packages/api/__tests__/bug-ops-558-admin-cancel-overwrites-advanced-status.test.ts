import type { Response } from 'supertest';
import { db } from '../src/models/db';
import { appendProviderAssignmentTermsInTransaction } from '../src/services/booking-financial-terms.service';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { allowAdminCancelAudits, adminCancelHttp } from './helpers/booking-admin-cancel-postgres';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantSnapshot,
  providerB, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug OPS-558 - an admin cancel cannot overwrite a booking that moved to a status it may not cancel from', async () => {
  await withParticipantRefundDatabase(async database => {
    await allowAdminCancelAudits(database);
    // An assigned, held booking with real assignment terms, under way.
    await db.transaction(async client => {
      await client.query("UPDATE bookings SET provider_id=$2, status='in_progress' WHERE id=$1", [bookingB, providerB]);
      await appendProviderAssignmentTermsInTransaction(client, {
        bookingId: bookingB, providerId: providerB, event: 'provider_assigned', sourceEventId: bookingB,
      });
    });

    // Everything except the booking row itself must end exactly as it is now.
    const before = await participantSnapshot(database);

    const blocker = await database.connect();
    let blockerOpen = true;
    let inFlight: Promise<Response> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [bookingB]);
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;

      // The admin cancel reads "in_progress" (cancellable) before any lock,
      // then waits.
      inFlight = Promise.resolve(adminCancelHttp()(bookingB));
      await waitForBlockedApproval(database, pid);

      // The provider completes the job first. This is direct SQL standing in
      // for the completion route, which also commits under this lock.
      await blocker.query(`UPDATE bookings SET status='completed_by_provider' WHERE id=$1`, [bookingB]);
      await blocker.query('COMMIT');
      blockerOpen = false;

      // Before OPS-558 this answered 200: a cancellation refund ran and
      // cancelled_by_admin was written over completed_by_provider, which is
      // not a valid edge.
      const response = await inFlight;
      expect(response.status).toBe(409);
      expect(response.body.error.message)
        .toBe('Cannot cancel booking in status "completed_by_provider". Use the canonical dispute or settlement workflow for completed money states.');
      const after = await participantSnapshot(database);
      expect({ ...after, bookings: undefined }).toEqual({ ...before, bookings: undefined });
      expect((await database.query('SELECT status,escrow_status FROM bookings WHERE id=$1', [bookingB])).rows)
        .toEqual([{ status: 'completed_by_provider', escrow_status: 'held' }]);
    } finally {
      if (blockerOpen) await blocker.query('ROLLBACK');
      // Let the request finish before the fixture drops its schema.
      if (inFlight) await inFlight.catch(() => undefined);
      blocker.release();
    }
  });
}, 30000);

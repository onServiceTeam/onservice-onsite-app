import {
  withMoneyDisputeDatabase, heldFor, fileDisputeHttp, adminResolveHttp, confirmedButReleasedB, bystanderBooking, bystanderHeld,
} from './helpers/money-dispute-postgres';
import { bookingIntegrationIt as it, bookingB } from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Booking B's money was already paid out by a manual release, and the
// customer then disputed. A "no refund" decision used to try to release it
// again after the decision; that was refused and left a release retry that
// can never succeed (it ends in Financials as "manual investigation"). The
// money is already where "no refund" says it belongs, so nothing is queued.
it('Bug FIN-024 - a no-refund decision on money already released queues no release', async () => {
  await withMoneyDisputeDatabase(async database => {
    await confirmedButReleasedB(database);
    const filed = await fileDisputeHttp()(bookingB);
    expect(filed.status).toBe(201);

    const decided = await adminResolveHttp()(filed.body.data.id, { resolutionType: 'no_refund' });

    expect({
      status: decided.status,
      dispute: (await database.query('SELECT status, resolution_type FROM disputes WHERE booking_id=$1', [bookingB])).rows,
      booking: (await database.query('SELECT status, escrow_status FROM bookings WHERE id=$1', [bookingB])).rows,
      retryRows: (await database.query('SELECT action_type, status FROM gateway_retry_queue ORDER BY created_at')).rows,
      heldB: await heldFor(database, bookingB),
      heldBystander: await heldFor(database, bystanderBooking),
    }).toEqual({
      status: 200,
      dispute: [{ status: 'resolved', resolution_type: 'no_refund' }],
      booking: [{ status: 'resolved', escrow_status: 'released' }],
      retryRows: [],
      heldB: 0,
      heldBystander: bystanderHeld,
    });
  });
}, 60000);

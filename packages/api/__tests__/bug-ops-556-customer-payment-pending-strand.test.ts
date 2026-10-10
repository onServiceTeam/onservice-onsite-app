import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  customerA, bookingA,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug OPS-556 - a customer cannot move a requested booking into an unpayable payment-pending state', async () => {
  await withParticipantRefundDatabase(async database => {
    // The shared fixture booking is already paid; only its status is set back
    // to requested. The guard decides from the requested status alone.
    await database.query("UPDATE bookings SET status='requested' WHERE id=$1", [bookingA]);
    const before = await participantSnapshot(database);

    // Before OPS-556 this answered 200 and left the booking at payment_pending,
    // which the wallet payment route then refuses: it pays only bookings that
    // can still move to payment_pending (requested and matched).
    const response = await participantHttp(customerA, 'customer')(bookingA, 'payment_pending');
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('BOOKING_TRANSITION_FLOW_ONLY');
    expect((await database.query('SELECT status FROM bookings WHERE id=$1', [bookingA])).rows)
      .toEqual([{ status: 'requested' }]);
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 30000);

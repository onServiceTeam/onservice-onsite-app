import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  operatorId, bookingA, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// F3 (docs/operations/00-DECISIONS-FOR-KEN.md): money actions belong to the
// super admin's audited money controls. Through the general status route a
// plain admin may not request any status that moves or starts money, ends a
// booking, or replaces a dedicated flow. The on-site steps (en route,
// arrived, in progress) are held for D35 Q1 and are pinned elsewhere
// (refund-transaction-postgres and the SEC-088 companion tests).
const MONEY_OR_FLOW_TARGETS = [
  'cancelled_by_admin', 'cancelled_by_customer', 'cancelled_by_provider',
  'confirmed', 'paid', 'disputed', 'resolved', 'payout_ready', 'paid_out',
  'completed_by_provider', 'requested', 'quoted', 'matched', 'payment_pending',
] as const;

it('Bug SEC-090 - a plain admin cannot move booking money or replace a dedicated flow through the status route', async () => {
  await withParticipantRefundDatabase(async database => {
    await database.query("UPDATE users SET role='admin' WHERE id=$1", [operatorId]);
    // Two different starting states: the refusal does not depend on state.
    await database.query("UPDATE bookings SET status='completed_by_provider' WHERE id=$1", [bookingB]);
    const before = await participantSnapshot(database);
    const patch = participantHttp(operatorId, 'admin');

    // Before SEC-090 this cancelled the paid wallet booking and refunded it in
    // full, without the super admin, reason or audit row the admin cancel needs.
    const cancelled = await patch(bookingA, 'cancelled_by_admin');
    expect(cancelled.status).toBe(403);
    expect(cancelled.body.error.message).toBe('Your admin role cannot make this booking change.');
    expect(await participantSnapshot(database)).toEqual(before);

    for (const target of MONEY_OR_FLOW_TARGETS) {
      for (const bookingId of [bookingA, bookingB]) {
        const response = await patch(bookingId, target);
        expect({ target, bookingId, status: response.status }).toEqual({ target, bookingId, status: 403 });
      }
    }
    expect(await participantSnapshot(database)).toEqual(before);
  });
}, 60000);

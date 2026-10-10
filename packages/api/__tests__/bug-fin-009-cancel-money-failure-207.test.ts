import { db } from '../src/models/db';
import { debitWalletInTransaction, holdEscrowInTransaction } from '../src/services/wallet.service';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  customerA, customerB, customerWalletA, escrowWallet, providerB, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const legacyBooking = '30000000-0000-4000-8000-000000000003';

it('Bug FIN-009 - a cancellation whose refund is refused changes nothing instead of answering 207', async () => {
  await withParticipantRefundDatabase(async database => {
    // A paid wallet booking funded through the real money helpers, with no
    // immutable financial terms row: a booking paid before migration 162
    // that has not been through the E50 legacy review.
    await database.query(`INSERT INTO bookings(id,customer_id,payment_method,service_price,service_fee,total_amount)
      VALUES ($1,$2,'wallet',80000,20000,100000)`, [legacyBooking, customerA]);
    await db.transaction(async client => {
      await client.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [legacyBooking]);
      await debitWalletInTransaction(client, customerWalletA, 100000, 'payment', 'Synthetic booking funding', legacyBooking);
      await holdEscrowInTransaction(client, escrowWallet, 100000, legacyBooking);
    });
    await database.query(`INSERT INTO payment_intents(booking_id,amount,payment_method,status)
      VALUES ($1,100000,'wallet','succeeded')`, [legacyBooking]);
    await database.query(`UPDATE bookings SET payment_intent_id=(SELECT id FROM payment_intents WHERE booking_id=$1)
      WHERE id=$1`, [legacyBooking]);
    const before = await participantSnapshot(database);

    // Before FIN-009 this answered 207 "cancellation recorded": the booking
    // became cancelled_by_customer while its escrow stayed held and nothing
    // was queued to refund it.
    const legacy = await participantHttp(customerA, 'customer')(legacyBooking, 'cancelled_by_customer');
    expect(legacy.status).toBe(409);
    expect(legacy.body.error.message).toBe(
      'Financial terms are missing for this booking. Money movement is blocked until operations completes the reviewed E50 legacy snapshot.',
    );
    expect(await participantSnapshot(database)).toEqual(before);

    // Second case: a booking whose provider does not match its immutable
    // terms (assigned by direct SQL, with no assignment terms appended).
    await database.query('UPDATE bookings SET provider_id=$2 WHERE id=$1', [bookingB, providerB]);
    const mismatched = await participantSnapshot(database);
    const mismatch = await participantHttp(customerB, 'customer')(bookingB, 'cancelled_by_customer');
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.message).toBe(
      'Booking does not match its immutable financial terms. Cancellation money movement is blocked for operations review.',
    );
    expect(await participantSnapshot(database)).toEqual(mismatched);
  });
}, 30000);

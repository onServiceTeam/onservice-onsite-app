import type { Pool } from 'pg';
import { db } from '../src/models/db';
import { debitWalletInTransaction, holdEscrowInTransaction } from '../src/services/wallet.service';
import {
  bookingIntegrationIt as it, withParticipantRefundDatabase, participantHttp, participantSnapshot,
  customerA, customerWalletA, escrowWallet, providerA, providerB, bookingA, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const legacyBooking = '30000000-0000-4000-8000-000000000003';

async function offer(database: Pool, bookingId: string, providerId: string, status: string, attempt: number) {
  const row = await database.query<{ id: string }>(`INSERT INTO booking_offers
      (booking_id,provider_id,status,expires_at,attempt_number)
    VALUES ($1,$2,$3,NOW() + INTERVAL '45 seconds',$4) RETURNING id`, [bookingId, providerId, status, attempt]);
  return row.rows[0]!.id;
}

async function offerState(database: Pool, offerId: string) {
  return (await database.query(`SELECT status, responded_at IS NOT NULL AS answered
    FROM booking_offers WHERE id=$1`, [offerId])).rows[0];
}

it('Bug OPS-557 - cancelling a booking closes its open provider offers in the same transaction', async () => {
  await withParticipantRefundDatabase(async database => {
    // A paid wallet booking with no immutable terms row (the FIN-009 case),
    // so its cancellation is refused.
    await database.query(`INSERT INTO bookings(id,customer_id,payment_method,service_price,service_fee,total_amount)
      VALUES ($1,$2,'wallet',80000,20000,100000)`, [legacyBooking, customerA]);
    await db.transaction(async client => {
      await client.query('SELECT id FROM bookings WHERE id=$1 FOR UPDATE', [legacyBooking]);
      await debitWalletInTransaction(client, customerWalletA, 100000, 'payment', 'Synthetic booking funding', legacyBooking);
      await holdEscrowInTransaction(client, escrowWallet, 100000, legacyBooking);
    });

    const openOnA = await offer(database, bookingA, providerA, 'pending', 1);
    const declinedOnA = await offer(database, bookingA, providerB, 'declined', 2);
    const openOnB = await offer(database, bookingB, providerA, 'pending', 1);
    const openOnLegacy = await offer(database, legacyBooking, providerB, 'pending', 1);

    // A refused cancellation leaves its offers exactly as they were.
    const before = await participantSnapshot(database);
    const refused = await participantHttp(customerA, 'customer')(legacyBooking, 'cancelled_by_customer');
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toBe(
      'Financial terms are missing for this booking. Money movement is blocked until operations completes the reviewed E50 legacy snapshot.',
    );
    expect(await participantSnapshot(database)).toEqual(before);
    expect(await offerState(database, openOnLegacy)).toEqual({ status: 'pending', answered: false });

    // Before OPS-557 the offer stayed 'pending' after the cancellation: the
    // provider still saw a job that no longer existed until it expired, and
    // the expiry sweep then tried to restart the offer cycle for it.
    const cancelled = await participantHttp(customerA, 'customer')(bookingA, 'cancelled_by_customer');
    expect(cancelled.status).toBe(200);
    expect(await offerState(database, openOnA)).toEqual({ status: 'cancelled', answered: true });
    // An offer the provider already answered, and another booking's offer,
    // are left alone.
    expect(await offerState(database, declinedOnA)).toEqual({ status: 'declined', answered: false });
    expect(await offerState(database, openOnB)).toEqual({ status: 'pending', answered: false });
  });
}, 30000);

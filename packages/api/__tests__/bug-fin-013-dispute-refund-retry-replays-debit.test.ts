import { db } from '../src/models/db';
import { refundFromEscrowInTransaction } from '../src/services/escrow.service';
import { processRetries } from '../src/services/gateway-retry.service';
import { withDisputeDatabase, bookingEscrowLeft } from './helpers/dispute-postgres';
import {
  bookingIntegrationIt as it, participantSnapshot, customerWalletB, escrowWallet, bookingB,
} from './helpers/booking-participant-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug FIN-013 - a queued dispute refund retry never takes the escrow money a second time', async () => {
  await withDisputeDatabase(async database => {
    // A dispute refund of 300,000 whose local escrow debit committed (the
    // customer's wallet was credited), followed by a queued whole-refund
    // retry: the row a lost commit acknowledgement left behind, or an older
    // row created before the payment-only retry existed.
    await db.transaction(client => refundFromEscrowInTransaction(
      client, bookingB, 300000, 'Admin dispute resolution: partial_refund',
    ));
    expect(await bookingEscrowLeft(database, escrowWallet, bookingB)).toBe('700000');
    await database.query(`INSERT INTO gateway_retry_queue
        (action_type, booking_id, amount_centavos, description, attempts, last_error, status)
      VALUES ('refund_from_escrow', $1, 300000, 'Admin dispute resolution: partial_refund', 0, 'lost acknowledgement', 'pending')`,
    [bookingB]);
    const before = await participantSnapshot(database);

    // Before FIN-013 the worker re-ran the whole refund: escrow fell to
    // 400,000 and the customer was credited 300,000 a second time.
    await processRetries(25);

    const after = await participantSnapshot(database);
    expect({ wallets: after.wallets, ledger: after.ledger, intents: after.intents })
      .toEqual({ wallets: before.wallets, ledger: before.ledger, intents: before.intents });
    expect(await bookingEscrowLeft(database, escrowWallet, bookingB)).toBe('700000');
    expect((await database.query('SELECT available_balance::text FROM wallets WHERE id=$1', [customerWalletB])).rows)
      .toEqual([{ available_balance: '1300000' }]);
    // The row goes to manual reconciliation instead of a blind replay, and
    // keeps its previous error as evidence for the reconciler.
    expect((await database.query(`SELECT status, last_error FROM gateway_retry_queue
        WHERE action_type='refund_from_escrow'`)).rows).toEqual([{
      status: 'failed_permanent',
      last_error: 'Replay of a local escrow refund is disabled (MC-03): reconcile this booking\'s escrow and payment record manually. Previous error: lost acknowledgement',
    }]);
  });
}, 60000);

// HA-M2-79 (customer human audit 2026-10-13, D38 Milestone 2, package P2;
// critique L10): the confirm preview is read-only. For a customer with no
// wallet it reports a balance of 0 (and that the wallet does not cover the
// total) without creating a wallet row; the shared wallet lookup would have
// inserted one. Real HTTP on the guarded PostgreSQL fixture. (Number 79 is
// the last free number in package P2's range; the critique added this case.)
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, customerB, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-79: the confirm preview reads a missing wallet as 0 and creates none', async () => {
  await withRequestFlowDatabase(async database => {
    await database.query(`DELETE FROM wallet_transactions WHERE wallet_id IN (SELECT id FROM wallets WHERE user_id = $1)`, [customerB]);
    await database.query('DELETE FROM wallets WHERE user_id = $1', [customerB]);
    const bookingId = await insertQuoteRequest(database, { customerId: customerB });
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id;

    const preview = await flowHttp(customerB, 'customer').confirmPreview(bookingId, quoteId);

    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({ totalAmount: 100000, walletBalance: 0, walletCovers: false });
    expect((await database.query('SELECT COUNT(*)::int AS n FROM wallets WHERE user_id = $1', [customerB])).rows[0].n).toBe(0);
  });
}, 90000);

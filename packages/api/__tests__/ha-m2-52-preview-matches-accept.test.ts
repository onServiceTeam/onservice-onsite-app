// HA-M2-52 (customer human audit 2026-10-13, D38 Milestone 2, package P2): the
// confirm screen's preview shows exactly what accepting will write: the same
// suki discount, service price, service fee and total (customer A is a 'suki'
// member of provider A, 5% off an 83,000 quote, then the 25% fee), and the
// same job time. Real HTTP on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, quoteBody, customerA, providerA, providerUserA,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-52: preview totals and job time equal what accept writes', async () => {
  await withRequestFlowDatabase(async database => {
    await database.query(`INSERT INTO suki_memberships (customer_id, provider_id, tier) VALUES ($1, $2, 'suki')`, [customerA, providerA]);
    const bookingId = await insertQuoteRequest(database);
    const quoteId = (await flowHttp(providerUserA, 'provider').quote(bookingId, quoteBody({ quotedPrice: 83000 }))).body.data.id;
    const customer = flowHttp(customerA, 'customer');

    const preview = await customer.confirmPreview(bookingId, quoteId);
    const accepted = await customer.accept(bookingId, quoteId);

    expect(preview.status).toBe(200);
    expect(preview.body.data).toMatchObject({
      quotedPrice: 83000, sukiDiscount: 4150, servicePrice: 78850, serviceFee: 19713, totalAmount: 98563,
      walletBalance: 150000, walletCovers: true,
      slot: { window: 'morning', status: 'ok' },
      address: { line: '22 Mango Avenue', barangay: 'Kamputhaw', city: 'Cebu City' },
    });
    expect(accepted.status).toBe(200);
    expect((await database.query(`SELECT service_price::int AS service_price, service_fee::int AS service_fee,
        total_amount::int AS total_amount, suki_discount::int AS suki_discount, scheduled_at
      FROM bookings WHERE id = $1`, [bookingId])).rows).toEqual([{
      service_price: preview.body.data.servicePrice,
      service_fee: preview.body.data.serviceFee,
      total_amount: preview.body.data.totalAmount,
      suki_discount: preview.body.data.sukiDiscount,
      scheduled_at: new Date(preview.body.data.slot.startsAt),
    }]);
    expect(accepted.body.data.totalAmount).toBe(preview.body.data.totalAmount);
  });
}, 90000);

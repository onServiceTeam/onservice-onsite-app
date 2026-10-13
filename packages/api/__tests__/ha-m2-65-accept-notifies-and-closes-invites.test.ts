// HA-M2-65 (customer human audit 2026-10-13, D38 Milestone 2, package P2): when
// the customer accepts a quote, the winning provider is told "Accepted. You
// get the job once they pay.", every other provider who quoted is told the
// customer chose another pro, and every invite still open closes. Compare
// mode so two providers quote; a third provider holds an open invite. Real
// HTTP and real rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, addProvider, notificationsOf, invitesOf,
  quoteBody, upsertPlatformSetting, customerA, providerC, providerUserA, providerUserB, providerUserC,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-65: accept notifies the winner and the not-selected providers and closes open invites', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_open_quotes', '5');
    await addProvider(database, { providerId: providerC, userId: providerUserC });
    const bookingId = await insertQuoteRequest(database);
    await database.query(`INSERT INTO job_request_invites (booking_id, provider_id, round, source, status)
      VALUES ($1, $2, 1, 'push', 'sent')`, [bookingId, providerC]);
    const quoteA = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id;
    const quoteB = (await flowHttp(providerUserB, 'provider').quote(bookingId, quoteBody({ quotedPrice: 90000 }))).body.data.id;

    expect((await flowHttp(customerA, 'customer').accept(bookingId, quoteA)).status).toBe(200);

    expect((await notificationsOf(database, providerUserA)).filter(n => n.type === 'quote_accepted')
      .map(n => [n.body, n.data.quoteId])).toEqual([['Accepted. You get the job once they pay.', quoteA]]);
    expect((await notificationsOf(database, providerUserB)).filter(n => n.type === 'quote_not_selected')
      .map(n => [n.body, n.data.quoteId])).toEqual([['The customer chose another pro for Aircon repair.', quoteB]]);
    expect((await notificationsOf(database, providerUserC)).filter(n => n.type.startsWith('quote_'))).toEqual([]);
    expect((await invitesOf(database, bookingId)).find(i => i.provider_id === providerC))
      .toMatchObject({ status: 'expired', closed: true });
  });
}, 90000);

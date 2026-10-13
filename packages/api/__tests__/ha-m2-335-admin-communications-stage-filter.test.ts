// HA-M2-335 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 overflow number, see HA-M2-330; design-threads.md section 6): the admin
// Communications list takes an optional `stage` filter, so support can review
// only the pre-booking request threads (the review surface while chat contact
// masking is not built) or only booked-job threads. The count follows the
// filter. Without the filter both kinds are listed. Real admin route as the
// fixture's super admin on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  adminHttp, bookProviderA, quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-335: the admin Communications list filters threads by stage', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    await bookProviderA(database);
    const admin = adminHttp();
    const summary = (body: { conversations: Array<Record<string, unknown>>; total: number }) => ({
      total: body.total,
      rows: body.conversations.map(row => [row.id, row.providerId, row.stage]).sort(),
    });

    const booking = await admin.get('/conversations?stage=booking');
    const request = await admin.get('/conversations?stage=request');
    const all = await admin.get('/conversations');

    expect(booking.status).toBe(200);
    expect(summary(booking.body)).toEqual({ total: 1, rows: [[threadA, providerUserA, 'booking']] });
    expect(request.status).toBe(200);
    expect(summary(request.body)).toEqual({ total: 1, rows: [[threadB, providerUserB, 'request']] });
    expect(summary(all.body)).toEqual({
      total: 2,
      rows: [[threadA, providerUserA, 'booking'], [threadB, providerUserB, 'request']].sort(),
    });
    expect((await admin.get('/conversations?stage=quoted')).status).toBe(400);
  });
}, 90000);

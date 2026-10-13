// HA-M2-135 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// once a provider is booked, the admin evidence tab and the proof-to-close
// summary count only the booked provider's chat messages, not the other
// providers' request threads on the same booking. Real admin routes on the
// guarded PostgreSQL fixture; the photo, checklist, signature and dispute
// tables they also read are empty stand-ins
// (helpers/request-thread-postgres.ts addBookingAdminReadShapes).
import {
  bookingIntegrationIt as it, customerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  addBookingAdminReadShapes, adminHttp, bookProviderA, insertMessage, quoteFromA, quoteFromB, requestBooking,
  seedQuoteRequest, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-135: evidence and proof chat counts include only the booked provider\'s thread', async () => {
  await withRequestThreadDatabase(async database => {
    await addBookingAdminReadShapes(database);
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    // Thread A: quote_sent + 2 messages. Thread B: quote_sent + 4 messages.
    await insertMessage(database, threadA, customerA, 'Morning works.');
    await insertMessage(database, threadA, providerUserA, 'See you at 9.');
    for (const content of ['Hello po', 'Which floor?', 'Is there parking?', 'I can do 1,900.']) {
      await insertMessage(database, threadB, providerUserB, content);
    }
    const admin = adminHttp();
    expect((await admin.get(`/bookings/${requestBooking}/evidence`)).body.data.chatMessageCount).toBe(8);

    await bookProviderA(database);

    const evidence = await admin.get(`/bookings/${requestBooking}/evidence`);
    const proof = await admin.get(`/bookings/${requestBooking}/proof-summary`);
    expect(evidence.status).toBe(200);
    expect(proof.status).toBe(200);
    expect(evidence.body.data.chatMessageCount).toBe(3);
    expect(proof.body.data.communications.chatMessageCount).toBe(3);
  });
}, 90000);

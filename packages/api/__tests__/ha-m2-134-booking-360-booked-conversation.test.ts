// HA-M2-134 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// Booking 360 (GET /api/v1/admin/bookings/:id) on a booking with a thread per
// quoting provider returns one booking and the BOOKED provider's conversation
// id. Before D38 it joined every conversation on the booking and took
// whichever row came first. Real admin route on the guarded PostgreSQL
// fixture; the business-billing tables it also reads are empty stand-ins
// (helpers/request-thread-postgres.ts addBookingAdminReadShapes).
import {
  bookingIntegrationIt as it, providerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  addBookingAdminReadShapes, adminHttp, bookProviderA, quoteFromA, quoteFromB, requestBooking, seedQuoteRequest,
  withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-134: Booking 360 returns one booking with the booked provider\'s conversation id', async () => {
  await withRequestThreadDatabase(async database => {
    await addBookingAdminReadShapes(database);
    await seedQuoteRequest(database);
    // Provider B's thread is older, so an unfiltered join would usually return it first.
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const admin = adminHttp();

    const beforeBooking = await admin.get(`/bookings/${requestBooking}`);
    expect(beforeBooking.status).toBe(200);
    expect(beforeBooking.body.data).toMatchObject({ id: requestBooking, conversationId: null, provider: null });

    await bookProviderA(database);
    const booked = await admin.get(`/bookings/${requestBooking}`);

    expect(booked.status).toBe(200);
    expect(booked.body.data).toMatchObject({
      id: requestBooking,
      status: 'payment_pending',
      conversationId: threadA,
      provider: { id: providerA, userId: providerUserA },
    });
    expect(booked.body.data.conversationId).not.toBe(threadB);
  });
}, 90000);

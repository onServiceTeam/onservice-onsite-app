// HA-M2-344 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B): message reads mint a fresh signed link every time, so a
// chat left open past a link's 10 minutes recovers by reading again. The
// customer reads A's thread and gets a link to provider A's photo. The clock
// then moves 11 minutes on (Date.now is advanced; the database clock is not
// involved in link expiry): the old link now answers 410 link_expired, and a
// new read of the same thread page returns a different link that serves the
// photo. Real routes, auth, job-media service and migrations
// 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { fetchSigned } from './helpers/job-media-postgres';
import { uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

afterEach(() => {
  jest.restoreAllMocks();
});

it('HA-M2-344: a thread read after the link expired returns a fresh working link', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoId = await uploadThreadPhoto(providerUserA, 'provider', threadA);
    const sent = await threadHttp(providerUserA, 'provider').send(threadA, { messageType: 'image', mediaId: photoId });
    expect(sent.status).toBe(201);
    const photoLink = async (): Promise<string> => {
      // A fresh client each time: its sign-in token is issued at the current clock.
      const page = await threadHttp(customerA, 'customer').messages(threadA, { limit: 30 });
      expect(page.status).toBe(200);
      return (page.body.data as Array<{ id: string; media: { url: string } }>)
        .find(message => message.id === sent.body.data.id)!.media.url;
    };

    const firstLink = await photoLink();
    expect((await fetchSigned(firstLink)).status).toBe(200);

    const elevenMinutesOn = Date.now() + 11 * 60 * 1000;
    jest.spyOn(Date, 'now').mockReturnValue(elevenMinutesOn);
    const expired = await fetchSigned(firstLink);
    expect(expired.status).toBe(410);

    const freshLink = await photoLink();
    expect(freshLink).not.toBe(firstLink);
    const served = await fetchSigned(freshLink);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
  });
}, 90000);

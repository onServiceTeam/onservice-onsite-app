// HA-M2-337 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B; number assigned by the orchestrator from 337-345): a photo a
// provider sends in a request thread reaches the customer. The provider
// uploads it through the real job-media routes and sends it with
// POST /:id/messages {messageType: 'image', mediaId, content: caption}; the
// customer's thread page then shows the message with its caption and a
// signed link minted for the customer, and that link serves exactly the
// stored photo. Real routes, auth, job-media service and migrations
// 006/123/138/183/184/185 on the guarded PostgreSQL fixture.
import fs from 'node:fs';
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp,
} from './helpers/request-thread-postgres';
import { fetchSigned, storePath } from './helpers/job-media-postgres';
import { threadPhotoBytes, uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-337: a thread photo reaches the other participant with a signed link that serves it', async () => {
  await withThreadMediaDatabase(async ({ database, uploadDir }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoId = await uploadThreadPhoto(providerUserA, 'provider', threadA, threadPhotoBytes(1234));

    const sent = await threadHttp(providerUserA, 'provider').send(threadA, {
      messageType: 'image', mediaId: photoId, content: 'This is the clogged drain line.',
    });
    expect(sent.status).toBe(201);

    const page = await threadHttp(customerA, 'customer').messages(threadA, { limit: 30 });
    expect(page.status).toBe(200);
    const photo = (page.body.data as Array<Record<string, any>>).find(message => message.id === sent.body.data.id);
    expect(photo).toMatchObject({
      senderId: providerUserA,
      senderRole: 'provider',
      messageType: 'image',
      content: 'This is the clogged drain line.',
      caption: 'This is the clogged drain line.',
      imageUrl: null,
      media: { id: photoId, kind: 'photo', mime: 'image/jpeg', durationMs: null },
    });
    // The link is the customer's own (token = mediaId.viewerId.exp.signature).
    expect(photo!.media.url).toMatch(new RegExp(`^/api/v1/job-media/file/${photoId}\\.${customerA}\\.\\d+\\.[0-9a-f]{64}$`));

    const served = await fetchSigned(photo!.media.url);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    const stored = (await database.query<{ storage_key: string }>(
      'SELECT storage_key FROM job_media WHERE id = $1', [photoId],
    )).rows[0]!;
    expect(Buffer.compare(served.body as Buffer, fs.readFileSync(storePath(uploadDir, stored.storage_key)))).toBe(0);
  });
}, 90000);

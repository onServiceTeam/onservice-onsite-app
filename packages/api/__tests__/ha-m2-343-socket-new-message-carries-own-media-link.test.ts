// HA-M2-343 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B): the live `new:message` event for a photo carries the media,
// with a signed link minted for whoever receives it. The customer and
// provider A both have A's thread open (joined to its socket room); the
// customer sends a photo over HTTP. Each socket receives new:message with
// media {id, kind 'photo'} and a link in its own name (customer's link to the
// customer, provider's link to the provider), and the provider's
// notification:message carries the provider's link. Both links serve the
// photo. Real Socket.IO server and clients, real handshake, real HTTP send,
// job-media service and migrations 006/123/138/183/184/185 on the guarded
// PostgreSQL fixture.
import type { Socket as ClientSocket } from 'socket.io-client';
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  accessToken, connectSocket, nextEvent, quoteFromA, requestBooking, seedQuoteRequest, startSocketServer,
  threadHttp,
} from './helpers/request-thread-postgres';
import { fetchSigned } from './helpers/job-media-postgres';
import { uploadThreadPhoto, withThreadMediaDatabase } from './helpers/thread-media-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

interface LiveMessage {
  id: string;
  messageType: string;
  media: { id: string; kind: string; url: string | null } | null;
}

it('HA-M2-343: socket new:message for a photo carries the media with each reader\'s own link', async () => {
  await withThreadMediaDatabase(async ({ database }) => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const photoId = await uploadThreadPhoto(customerA, 'customer', threadA);
    const server = await startSocketServer();
    const clients: ClientSocket[] = [];
    try {
      const customer = await connectSocket(server.url, accessToken(customerA, 'customer'));
      const provider = await connectSocket(server.url, accessToken(providerUserA, 'provider'));
      clients.push(customer, provider);
      customer.emit('join:conversation', threadA);
      provider.emit('join:conversation', threadA);
      // Joins are checked against the database first; wait until both are in the room.
      for (let waited = 0; (server.io.sockets.adapter.rooms.get(`conversation:${threadA}`)?.size ?? 0) < 2; waited += 25) {
        if (waited > 3000) throw new Error('sockets did not join the thread room');
        await new Promise(resolve => setTimeout(resolve, 25));
      }

      const toCustomer = nextEvent<LiveMessage>(customer, 'new:message');
      const toProvider = nextEvent<LiveMessage>(provider, 'new:message');
      const notice = nextEvent<{ message: LiveMessage }>(provider, 'notification:message');
      const sent = await threadHttp(customerA, 'customer').send(threadA, {
        messageType: 'image', mediaId: photoId, content: 'Water collects here',
      });
      expect(sent.status).toBe(201);

      const [customerCopy, providerCopy, noticeCopy] = await Promise.all([toCustomer, toProvider, notice]);
      for (const copy of [customerCopy, providerCopy, noticeCopy.message]) {
        expect(copy).toMatchObject({ id: sent.body.data.id, messageType: 'image', media: { id: photoId, kind: 'photo' } });
      }
      expect(customerCopy.media!.url).toMatch(new RegExp(`/file/${photoId}\\.${customerA}\\.`));
      expect(providerCopy.media!.url).toMatch(new RegExp(`/file/${photoId}\\.${providerUserA}\\.`));
      expect(noticeCopy.message.media!.url).toMatch(new RegExp(`/file/${photoId}\\.${providerUserA}\\.`));
      for (const url of [customerCopy.media!.url!, providerCopy.media!.url!]) {
        const served = await fetchSigned(url);
        expect(served.status).toBe(200);
        expect(served.headers['content-type']).toBe('image/jpeg');
      }
    } finally {
      for (const client of clients) client.close();
      await server.close();
    }
  });
}, 90000);

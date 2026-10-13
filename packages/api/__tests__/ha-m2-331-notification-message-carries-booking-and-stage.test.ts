// HA-M2-331 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 overflow number, see HA-M2-330; merged.md 2.4): the live
// `notification:message` socket event the other participant gets for a new
// chat message carries conversationId, bookingId and stage next to the
// message, so the app's banner can open the right thread (a booking can now
// have one thread per provider). Real Socket.IO server and client, real
// handshake, and a real HTTP send on the guarded PostgreSQL fixture.
import type { Socket as ClientSocket } from 'socket.io-client';
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  accessToken, connectSocket, nextEvent, quoteFromA, requestBooking, seedQuoteRequest, startSocketServer,
  threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-331: notification:message carries the conversation, the booking and the thread stage', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const server = await startSocketServer();
    let provider: ClientSocket | undefined;
    try {
      provider = await connectSocket(server.url, accessToken(providerUserA, 'provider'));
      const notice = nextEvent<Record<string, unknown>>(provider, 'notification:message');

      const sent = await threadHttp(customerA, 'customer').send(threadA, { content: 'Is 9 in the morning okay?' });
      expect(sent.status).toBe(201);

      expect(await notice).toEqual({
        conversationId: threadA,
        bookingId: requestBooking,
        stage: 'request',
        message: expect.objectContaining({
          id: sent.body.data.id,
          conversationId: threadA,
          senderId: customerA,
          senderRole: 'customer',
          content: 'Is 9 in the morning okay?',
          messageType: 'text',
        }),
      });
    } finally {
      provider?.close();
      await server.close();
    }
  });
}, 90000);

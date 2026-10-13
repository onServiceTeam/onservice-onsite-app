// HA-M2-334 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 overflow number, see HA-M2-330): a provider whose quote is no longer
// live (declined here) can still open their own thread from My quotes
// (merged.md 2.3: a quote of any status gets the provider their thread), but
// the thread opens quietly and read-only: no "Sent a quote" notice is posted
// with today's time, nothing counts as unread for the customer, and the
// customer's app gets no conversation:opened or message event. Before the fix
// a pro the customer had already turned down showed up in the customer's
// inbox with a fresh unread "Sent a quote". Real HTTP routes and a real
// Socket.IO server and client on the guarded PostgreSQL fixture.
import type { Socket as ClientSocket } from 'socket.io-client';
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  accessToken, connectSocket, quoteFromA, requestBooking, seedQuoteRequest, startSocketServer, threadHttp,
  withRequestThreadDatabase,
} from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-334: a provider opening a thread on a quote that is no longer live posts no quote_sent and tells the customer nothing', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'too_expensive',
        declined_at = NOW() WHERE id = $1`, [quoteFromA]);
    const server = await startSocketServer();
    let customerSocket: ClientSocket | undefined;
    try {
      customerSocket = await connectSocket(server.url, accessToken(customerA, 'customer'));
      const customerEvents: string[] = [];
      for (const event of ['conversation:opened', 'notification:message', 'new:message']) {
        customerSocket.on(event, () => customerEvents.push(event));
      }

      const opened = await threadHttp(providerUserA, 'provider').open({ bookingId: requestBooking });
      expect(opened.status).toBe(201);
      expect(opened.body.data).toMatchObject({
        bookingId: requestBooking, providerId: providerUserA, state: 'read_only', stateReason: 'quote_declined',
      });
      await new Promise(resolve => setTimeout(resolve, 400));

      expect((await database.query('SELECT COUNT(*)::int AS count FROM messages')).rows).toEqual([{ count: 0 }]);
      expect(customerEvents).toEqual([]);
      const inbox = await threadHttp(customerA, 'customer').list({ view: 'inbox' });
      expect(inbox.body.data.items.map((item: Record<string, unknown>) =>
        [item.id, item.state, item.unreadCount, item.lastMessage])).toEqual([
        [opened.body.data.id, 'read_only', 0, null],
      ]);
    } finally {
      customerSocket?.close();
      await server.close();
    }
  });
}, 90000);

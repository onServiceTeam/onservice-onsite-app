// HA-M2-140 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// a socket `send:message` into a read-only thread (quote declined) is refused
// with error code THREAD_READ_ONLY, stores nothing and broadcasts nothing,
// while the same socket send into an open thread is stored and delivered.
// Socket sends now go through the same participant send path as HTTP. Real
// Socket.IO server and client, real handshake, on the guarded PostgreSQL
// fixture.
import type { Socket as ClientSocket } from 'socket.io-client';
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  accessToken, connectSocket, nextEvent, quoteFromA, quoteFromB, requestBooking, seedQuoteRequest,
  startSocketServer, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-140: a socket send:message into a read-only thread stores nothing', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'timing',
        declined_at = NOW() WHERE id = $1`, [quoteFromA]);
    const server = await startSocketServer();
    let customer: ClientSocket | undefined;
    try {
      customer = await connectSocket(server.url, accessToken(customerA, 'customer'));
      const broadcasts: unknown[] = [];
      customer.on('new:message', payload => broadcasts.push(payload));
      customer.emit('join:conversation', threadA);
      customer.emit('join:conversation', threadB);
      // The joins are checked against the database before the rooms are joined.
      await new Promise(resolve => setTimeout(resolve, 300));
      const before = (await database.query('SELECT id FROM messages ORDER BY id')).rows;

      const refusal = nextEvent<{ message: string; code?: string }>(customer, 'error');
      customer.emit('send:message', { conversationId: threadA, content: 'Can we try again tomorrow?' });
      expect(await refusal).toEqual({ message: 'This conversation is read-only.', code: 'THREAD_READ_ONLY' });
      await new Promise(resolve => setTimeout(resolve, 200));
      expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(before);
      expect(broadcasts).toEqual([]);

      // The open thread still takes socket sends.
      const delivered = nextEvent<{ conversationId: string; content: string }>(customer, 'new:message');
      customer.emit('send:message', { conversationId: threadB, content: 'Yes please, tomorrow at 10.' });
      expect(await delivered).toMatchObject({ conversationId: threadB, content: 'Yes please, tomorrow at 10.' });
      expect((await database.query(`SELECT conversation_id FROM messages WHERE sender_id = $1`, [customerA])).rows)
        .toEqual([{ conversation_id: threadB }]);
    } finally {
      customer?.close();
      await server.close();
    }
  });
}, 90000);

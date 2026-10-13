// HA-M2-149 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, not numbered in merged.md section 4): a "typing" signal in an
// open thread reaches the other participant, and once the thread is
// read-only (quote declined) the same signal is dropped silently. Real
// Socket.IO server and clients on the guarded PostgreSQL fixture.
import type { Socket as ClientSocket } from 'socket.io-client';
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  accessToken, connectSocket, nextEvent, quoteFromA, requestBooking, seedQuoteRequest, startSocketServer,
  withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-149: typing in a read-only thread is not relayed to the other participant', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const server = await startSocketServer();
    let customer: ClientSocket | undefined;
    let provider: ClientSocket | undefined;
    try {
      customer = await connectSocket(server.url, accessToken(customerA, 'customer'));
      provider = await connectSocket(server.url, accessToken(providerUserA, 'provider'));
      customer.emit('join:conversation', threadA);
      provider.emit('join:conversation', threadA);
      await new Promise(resolve => setTimeout(resolve, 300));

      const relayed = nextEvent<{ userId: string }>(customer, 'typing:start');
      provider.emit('typing:start', threadA);
      expect(await relayed).toEqual({ userId: providerUserA });

      await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'timing',
          declined_at = NOW() WHERE id = $1`, [quoteFromA]);
      const late: unknown[] = [];
      customer.on('typing:start', payload => late.push(payload));
      provider.emit('typing:start', threadA);
      await new Promise(resolve => setTimeout(resolve, 600));
      expect(late).toEqual([]);
    } finally {
      customer?.close();
      provider?.close();
      await server.close();
    }
  });
}, 90000);

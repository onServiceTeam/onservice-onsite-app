// HA-M2-152 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, not numbered in merged.md section 4): afterQuoteAccepted, the
// hook P2 calls after acceptQuote commits, opens the booked provider's thread
// when it is missing (a quote sent before migration 185), posts
// booking_confirmed from the customer exactly once however often it runs, and
// tells the other provider live that their thread is now read-only. It writes
// no thread state. Real Socket.IO server and client on the guarded PostgreSQL
// fixture.
import type { Socket as ClientSocket } from 'socket.io-client';
import {
  bookingIntegrationIt as it, customerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  accessToken, bookProviderA, connectSocket, nextEvent, quoteFromB, requestBooking, seedQuoteRequest,
  startSocketServer, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { afterQuoteAccepted, ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-152: afterQuoteAccepted posts booking_confirmed once and tells the other provider their thread is read-only', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadB = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB }))!.conversationId;
    await bookProviderA(database);
    const server = await startSocketServer();
    let providerB: ClientSocket | undefined;
    try {
      providerB = await connectSocket(server.url, accessToken(providerUserB, 'provider'));
      const stateEvent = nextEvent<Record<string, unknown>>(providerB, 'conversation:state');

      await afterQuoteAccepted({ bookingId: requestBooking });
      await afterQuoteAccepted({ bookingId: requestBooking });

      expect(await stateEvent).toEqual({ conversationId: threadB, state: 'read_only', stateReason: 'other_provider_booked' });
      const threads = (await database.query(`SELECT id, provider_id, state FROM conversations
          WHERE booking_id = $1 ORDER BY created_at`, [requestBooking])).rows;
      expect(threads.map(row => [row.provider_id, row.state])).toEqual([[providerUserB, 'open'], [providerUserA, 'open']]);
      const bookedThread = threads[1].id as string;
      expect((await database.query(`SELECT sender_id, system_event, content FROM messages
          WHERE conversation_id = $1`, [bookedThread])).rows).toEqual([{
        sender_id: customerA, system_event: 'booking_confirmed',
        content: 'Confirmed the booking. Payment is the next step.',
      }]);
    } finally {
      providerB?.close();
      await server.close();
    }
  });
}, 90000);

// HA-M2-329 (customer human audit 2026-10-13, D38 Milestone 2, W3 step I2;
// W3-A overflow number): when the customer cancels an open quote request, the
// request threads on it become read-only (request_cancelled, derived from the
// cancelled booking), and both participants of each thread are told live
// with `conversation:state`, so an open chat screen closes its composer
// without waiting for a refresh. Real HTTP (the provider's quote opens the
// thread, then the customer's cancel) and a real Socket.IO server
// (production handshake) on the guarded PostgreSQL fixture with the real
// migrations 183, 184 and 185.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, listenAs, customerA, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';
import { REALTIME_EVENTS } from '../src/services/realtime-events';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-329: cancelling a request sends its threads\' read-only state to both participants', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    expect((await flowHttp(providerUserA, 'provider').quote(bookingId)).status).toBe(201);
    const conversationId = (await database.query('SELECT id FROM conversations WHERE booking_id = $1', [bookingId])).rows[0].id;
    const sockets = await listenAs([
      { userId: customerA, role: 'customer' }, { userId: providerUserA, role: 'provider' }, { userId: providerUserB, role: 'provider' },
    ]);
    try {
      expect((await flowHttp(customerA, 'customer').cancel(bookingId)).status).toBe(200);
      await new Promise(resolve => setTimeout(resolve, 300));

      const stateEvents = (userId: string) => sockets.events.get(userId)!
        .filter(e => e.event === REALTIME_EVENTS.CONVERSATION_STATE).map(e => e.payload);
      const closed = { conversationId, state: 'read_only', stateReason: 'request_cancelled' };
      expect(stateEvents(customerA)).toEqual([closed]);
      expect(stateEvents(providerUserA)).toEqual([closed]);
      expect(stateEvents(providerUserB)).toEqual([]);
    } finally {
      await sockets.close();
    }
  }, { through: 185 });
}, 90000);

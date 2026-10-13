// HA-M2-322 (customer human audit 2026-10-13, D38 Milestone 2; W3-A overflow
// number for an item the P2 build report left untested): when a provider's
// quote is admitted, the customer-only live events `quote:received` (with the
// provider's name and price) and `request:updated` (the request's new stage)
// reach the customer who posted the request and nobody else: not the quoting
// provider, not the other eligible provider and not another customer. Real
// HTTP and a real Socket.IO server (production handshake) on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, listenAs,
  customerA, customerB, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';
import { REALTIME_EVENTS } from '../src/services/realtime-events';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-322: request:updated and quote:received reach only the customer', async () => {
  await withRequestFlowDatabase(async database => {
    const bookingId = await insertQuoteRequest(database);
    const sockets = await listenAs([
      { userId: customerA, role: 'customer' }, { userId: customerB, role: 'customer' },
      { userId: providerUserA, role: 'provider' }, { userId: providerUserB, role: 'provider' },
    ]);
    let quoteId: string;
    try {
      const quoted = await flowHttp(providerUserA, 'provider').quote(bookingId);
      expect(quoted.status).toBe(201);
      quoteId = quoted.body.data.id as string;
      await new Promise(resolve => setTimeout(resolve, 300));

      const customerEvents = (userId: string) => sockets.events.get(userId)!
        .filter(e => e.event === REALTIME_EVENTS.QUOTE_RECEIVED || e.event === REALTIME_EVENTS.REQUEST_UPDATED);
      expect(customerEvents(customerA)).toEqual([
        { event: REALTIME_EVENTS.QUOTE_RECEIVED, payload: { bookingId, quoteId, providerName: 'Synthetic Aircon Team A', quotedPrice: 80000 } },
        { event: REALTIME_EVENTS.REQUEST_UPDATED, payload: { bookingId, status: 'quoted', stage: 'quote_ready', round: 1, opsReview: false } },
      ]);
      for (const other of [customerB, providerUserA, providerUserB]) expect(customerEvents(other)).toEqual([]);
    } finally {
      await sockets.close();
    }
  });
}, 90000);

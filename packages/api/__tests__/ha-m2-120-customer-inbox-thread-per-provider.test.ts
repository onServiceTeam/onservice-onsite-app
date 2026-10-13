// HA-M2-120 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// the customer's inbox (GET /api/v1/conversations?view=inbox) lists one
// thread per provider who quoted, with the provider's short name, the last
// message preview and that thread's unread count, and never the exact
// address. Threads are opened by the real ensureRequestThread (the call P2
// makes after a quote is admitted); messages go through the real HTTP send.
import {
  bookingIntegrationIt as it, customerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, quoteFromB, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-120: the customer inbox shows one thread per responding provider with name, preview and unread count', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA });
    const threadB = await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromB });
    expect(threadA).toMatchObject({ created: true });
    expect(threadB).toMatchObject({ created: true });

    const providerA = threadHttp(providerUserA, 'provider');
    const providerB = threadHttp(providerUserB, 'provider');
    // The customer's own message never counts as unread for the customer.
    expect((await threadHttp(customerA, 'customer').send(threadA!.conversationId, {
      content: 'Can you come this week?',
    })).status).toBe(201);
    expect((await providerA.send(threadA!.conversationId, { content: 'I can come tomorrow morning.' })).status).toBe(201);
    expect((await providerB.send(threadB!.conversationId, { content: 'Is the unit on the second floor?' })).status).toBe(201);
    expect((await providerB.send(threadB!.conversationId, { content: 'I have the capacitor in stock.' })).status).toBe(201);

    const response = await threadHttp(customerA, 'customer').list({ view: 'inbox' });

    expect(response.status).toBe(200);
    expect(response.body.data.meta).toEqual({ total: 2, page: 1, pageSize: 20, totalPages: 1 });
    // Most recent activity first: provider B wrote last.
    expect(response.body.data.items).toEqual([
      {
        id: threadB!.conversationId,
        bookingId: requestBooking,
        stage: 'request',
        state: 'open',
        stateReason: null,
        otherParty: { userId: providerUserB, displayName: 'Carla D.', avatarUrl: null, role: 'provider' },
        service: 'Aircon repair',
        context: { serviceName: 'Aircon repair', barangay: 'Kamputhaw', city: 'Cebu City' },
        bookingStatus: 'quoted',
        lastMessage: {
          preview: 'I have the capacitor in stock.',
          messageType: 'text',
          senderIsMe: false,
          createdAt: expect.any(String),
          // Text: no photo or voice note (wave 3 added lastMessage.media).
          media: null,
        },
        // quote_sent plus two messages, all from provider B.
        unreadCount: 3,
        updatedAt: expect.any(String),
      },
      {
        id: threadA!.conversationId,
        bookingId: requestBooking,
        stage: 'request',
        state: 'open',
        stateReason: null,
        otherParty: { userId: providerUserA, displayName: 'Ben S.', avatarUrl: null, role: 'provider' },
        service: 'Aircon repair',
        context: { serviceName: 'Aircon repair', barangay: 'Kamputhaw', city: 'Cebu City' },
        bookingStatus: 'quoted',
        lastMessage: {
          preview: 'I can come tomorrow morning.',
          messageType: 'text',
          senderIsMe: false,
          createdAt: expect.any(String),
          // Text: no photo or voice note (wave 3 added lastMessage.media).
          media: null,
        },
        // quote_sent plus provider A's reply; the customer's own message is not counted.
        unreadCount: 2,
        updatedAt: expect.any(String),
      },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('Mango Avenue');
  });
}, 90000);

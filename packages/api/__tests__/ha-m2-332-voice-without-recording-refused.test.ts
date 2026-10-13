// HA-M2-332 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 overflow number, see HA-M2-330; design-threads.md section 3): a voice
// message must point at its recording (mediaId). POST /:id/messages with
// messageType 'voice' and no mediaId is refused by the request validator with
// 400 on the mediaId field and stores nothing. This holds before and after
// thread media lands in wave 3 (today the service would also refuse voice,
// with 422, but the body rule is the validator's). Real HTTP route on the
// guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-332: a voice message without its recording gets 400 and stores nothing', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const threadA = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const before = (await database.query('SELECT id FROM messages ORDER BY id')).rows;

    const refused = await threadHttp(customerA, 'customer').send(threadA, {
      messageType: 'voice', content: '', clientMessageId: '89000000-0000-4000-8000-000000000001',
    });

    expect(refused.status).toBe(400);
    expect(refused.body.error.details).toEqual([
      { field: 'mediaId', message: 'A voice message needs its recording (mediaId).' },
    ]);
    expect((await database.query('SELECT id FROM messages ORDER BY id')).rows).toEqual(before);
  });
}, 90000);

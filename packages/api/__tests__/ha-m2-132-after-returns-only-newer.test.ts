// HA-M2-132 (customer human audit 2026-10-13, D38 Milestone 2, package P4):
// the catch-up read (GET /:id/messages?after=<id>) returns only messages newer
// than the cursor, oldest first, and nothing once the reader is up to date;
// a message sent afterwards is the only one the next catch-up returns. This
// is what an app polls with while its live connection is down. Real HTTP
// routes on the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  insertMessage, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const thread = '88100000-0000-4000-8000-000000000001';

it('HA-M2-132: after returns only messages newer than the cursor', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    await database.query(`INSERT INTO conversations (id, booking_id, customer_id, provider_id) VALUES ($1, $2, $3, $4)`,
      [thread, requestBooking, customerA, providerUserA]);
    const ids: string[] = [];
    for (const [index, content] of ['m1', 'm2', 'm3', 'm4', 'm5'].entries()) {
      ids.push(await insertMessage(database, thread, index % 2 ? providerUserA : customerA, content,
        `2026-10-01T0${index + 1}:00:00.000Z`));
    }
    const customer = threadHttp(customerA, 'customer');

    const catchUp = await customer.messages(thread, { after: ids[2]! });
    expect(catchUp.status).toBe(200);
    expect(catchUp.body.data.map((message: { content: string }) => message.content)).toEqual(['m4', 'm5']);
    expect(catchUp.body.meta).toMatchObject({ hasMore: false, nextBefore: null });

    const upToDate = await customer.messages(thread, { after: ids[4]! });
    expect(upToDate.body.data).toEqual([]);

    const sent = await threadHttp(providerUserA, 'provider').send(thread, { content: 'm6 sent live' });
    expect(sent.status).toBe(201);
    const next = await customer.messages(thread, { after: ids[4]! });
    expect(next.body.data.map((message: { id: string; content: string }) => [message.id, message.content]))
      .toEqual([[sent.body.data.id, 'm6 sent live']]);
  });
}, 90000);

// HA-M2-155 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// P4 range, added by the review fix): apps that are not connected catch up
// with GET /:id/messages?after=<last id they have>, which relies on messages
// in one thread committing in (created_at, id) order. A system message posted
// by a post-commit hook (here the quote decline) while a participant's send
// holds the thread must take its time AFTER that send, so the poller that
// already has the participant's message still gets the system message with
// after=. Before the fix the hook stamped its row first, waited on the thread,
// and committed later with the earlier time, so after= skipped it for good.
//
// The participant send is held open on its own connection with exactly the
// steps sendParticipantMessage takes (lock the thread row FOR NO KEY UPDATE,
// store at clock_timestamp(), move the activity time, commit). The hook is the
// real postQuoteEvent. Real HTTP reads on the guarded PostgreSQL fixture.
import type { Pool } from 'pg';
import {
  bookingIntegrationIt as it, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  quoteFromA, requestBooking, seedQuoteRequest, threadHttp, withRequestThreadDatabase,
} from './helpers/request-thread-postgres';
import { ensureRequestThread, postQuoteEvent } from '../src/services/request-thread.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

/** Resolve once some other session is waiting on a lock the given backend holds. */
async function waitUntilBlockedBy(database: Pool, pid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const waiting = await database.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))', [pid]);
    if (waiting.rows[0]!.count > 0) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('The decline hook never waited on the thread.');
}

it('HA-M2-155: a system message that waits on a participant send is stamped after it, so after= catch-up never skips it', async () => {
  await withRequestThreadDatabase(async database => {
    await seedQuoteRequest(database);
    const thread = (await ensureRequestThread({ bookingId: requestBooking, quoteId: quoteFromA }))!.conversationId;
    const customer = threadHttp(customerA, 'customer');
    const opening = await customer.messages(thread, { limit: 30 });
    const quoteSentId = opening.body.data.at(-1).id as string;
    await database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'timing',
        declined_at = NOW() WHERE id = $1`, [quoteFromA]);

    const sender = await database.connect();
    let liveId: string;
    try {
      await sender.query('BEGIN');
      await sender.query('SELECT c.id FROM conversations c WHERE c.id = $1 FOR NO KEY UPDATE OF c', [thread]);
      const pid = (await sender.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      const hook = postQuoteEvent({
        bookingId: requestBooking, quoteId: quoteFromA, event: 'quote_declined', declineReason: 'timing',
      });
      await waitUntilBlockedBy(database, pid);
      liveId = (await sender.query<{ id: string }>(`INSERT INTO messages (conversation_id, sender_id, content, created_at)
          VALUES ($1, $2, 'I can come earlier if that helps.', clock_timestamp()) RETURNING id`,
      [thread, providerUserA])).rows[0]!.id;
      await sender.query('UPDATE conversations SET updated_at = NOW() WHERE id = $1', [thread]);
      await sender.query('COMMIT');
      expect(await hook).toBe(true);
    } finally {
      sender.release();
    }

    // In commit order: the provider's message, then the decline notice.
    const sinceQuote = await customer.messages(thread, { after: quoteSentId });
    expect(sinceQuote.body.data.map((message: { content: string; systemEvent: string | null }) =>
      [message.content, message.systemEvent])).toEqual([
      ['I can come earlier if that helps.', null],
      ['Declined the quote. Reason: Timing did not work.', 'quote_declined'],
    ]);
    // A poller that already holds the provider's message still gets the notice.
    const catchUp = await customer.messages(thread, { after: liveId });
    expect(catchUp.status).toBe(200);
    expect(catchUp.body.data.map((message: { systemEvent: string | null }) => message.systemEvent))
      .toEqual(['quote_declined']);
  });
}, 90000);

// HA-M2-114 (customer human audit 2026-10-13, D38 Milestone 2, package P3,
// merged.md P3 test 114): starting a chat upload into a request thread that
// is effectively read-only is refused with 403 THREAD_READ_ONLY for both
// participants: here the customer declined the provider's quote (merged.md
// section 2.2). While the quote was live the same start was accepted, and a
// user who is not in the conversation gets 404. Real router, auth, service
// and migrations 006/123/138/183/184 on the guarded PostgreSQL fixture
// (before migration 185 adds a stored thread state).
import crypto from 'node:crypto';
import { bookingIntegrationIt as it, customerA, customerB, providerA, providerUserA } from './helpers/booking-participant-postgres';
import {
  createConversation, createQuoteRequest, declineQuote, mediaHttp, submitQuote, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-114: a chat upload start into a read-only thread gets 403 THREAD_READ_ONLY', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const bookingId = await createQuoteRequest(database);
    const quoteId = await submitQuote(database, bookingId, providerA);
    const conversationId = await createConversation(database, bookingId, customerA, providerUserA);
    const voice = (http: ReturnType<typeof mediaHttp>) => http.start({
      purpose: 'chat', conversationId, kind: 'voice', mime: 'audio/mp4', totalBytes: 20_000, durationMs: 9_000,
      clientUploadId: crypto.randomUUID(),
    });
    const customer = mediaHttp(customerA, 'customer');
    const provider = mediaHttp(providerUserA, 'provider');

    expect((await voice(provider)).status).toBe(201);
    const outsider = await voice(mediaHttp(customerB, 'customer'));
    expect(outsider.status).toBe(404);
    expect(outsider.body.error.code).toBe('THREAD_NOT_FOUND');

    await declineQuote(database, quoteId);
    for (const participant of [provider, customer]) {
      const refused = await voice(participant);
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe('THREAD_READ_ONLY');
    }
    expect((await database.query('SELECT count(*)::int AS n FROM job_media')).rows).toEqual([{ n: 1 }]);
  });
}, 60000);

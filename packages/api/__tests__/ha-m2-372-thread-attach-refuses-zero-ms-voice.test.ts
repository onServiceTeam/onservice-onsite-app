// HA-M2-372 (customer human audit 2026-10-13, D38 Milestone 2, package P3
// review fix; P3 overflow number, see HA-M2-370): attachChatMediaInTransaction
// never hands request threads (package P4) a voice-note length that
// migration 185 refuses. A stored thread voice note whose length is 0 ms (a
// row written before the upload checks of HA-M2-118/119/370/371) gives 422
// MEDIA_INVALID and stays stored, instead of returning durationMs 0, which
// messages_media_duration_check (1-600000 ms) would turn into a 500 on send.
// Real service and migrations 006/123/138/183/184 on the guarded PostgreSQL
// fixture.
import { db } from '../src/models/db';
import { attachChatMediaInTransaction } from '../src/services/job-media.service';
import {
  bookingIntegrationIt as it, customerA, providerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  createConversation, createQuoteRequest, mediaHttp, submitQuote, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';
import { buildMp4 } from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-372: thread attach refuses a stored 0 ms voice note with 422 MEDIA_INVALID', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const bookingId = await createQuoteRequest(database);
    await submitQuote(database, bookingId, providerA);
    const conversationId = await createConversation(database, bookingId, customerA, providerUserA);
    const customer = mediaHttp(customerA, 'customer');
    const voice = await uploadThroughApi(customer, {
      purpose: 'chat', conversationId, kind: 'voice', mime: 'audio/mp4', durationMs: 8000,
      bytes: buildMp4({ brand: 'M4A ', durationMs: 8000, tracks: [{ handler: 'soun', codec: 'mp4a' }] }),
    });
    expect(voice.completed.status).toBe(200);
    await database.query('UPDATE job_media SET duration_ms = 0 WHERE id = $1', [voice.id]);

    await expect(db.transaction(client => attachChatMediaInTransaction(client, {
      mediaId: voice.id, conversationId, senderId: customerA, expectedKind: 'voice',
    }))).rejects.toMatchObject({ statusCode: 422, code: 'MEDIA_INVALID' });
    expect((await database.query('SELECT status, booking_id FROM job_media WHERE id = $1', [voice.id])).rows)
      .toEqual([{ status: 'stored', booking_id: null }]);
  });
}, 60000);

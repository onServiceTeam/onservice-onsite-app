// HA-M2-117 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// number from the P3 block 80-119): attachChatMediaInTransaction, which
// request threads (package P4) call when a photo or voice note is sent,
// accepts only the sender's own stored upload for that conversation and of
// the message's kind, once: someone else's upload, the wrong kind, a request
// photo or a second attach gives 422 MEDIA_INVALID, and a voice note longer
// than the limit it was uploaded under gives 422 VOICE_TOO_LONG. A valid
// voice note attaches with its measured length. Real service and migrations
// 006/123/138/183/184 on the guarded PostgreSQL fixture.
import { db } from '../src/models/db';
import { attachChatMediaInTransaction } from '../src/services/job-media.service';
import {
  bookingIntegrationIt as it, customerA, providerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  createConversation, createQuoteRequest, mediaHttp, submitQuote, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';
import { buildMp4 } from './helpers/mp4-builder';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-117: thread attach accepts only the sender’s own stored upload of the right kind, once, within the voice limit', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const bookingId = await createQuoteRequest(database);
    await submitQuote(database, bookingId, providerA);
    const conversationId = await createConversation(database, bookingId, customerA, providerUserA);
    const customer = mediaHttp(customerA, 'customer');
    const provider = mediaHttp(providerUserA, 'provider');
    const voiceBytes = buildMp4({ brand: 'M4A ', durationMs: 12_000, tracks: [{ handler: 'soun', codec: 'mp4a' }] });
    const voice = await uploadThroughApi(customer, { purpose: 'chat', conversationId, kind: 'voice', mime: 'audio/mp4', bytes: voiceBytes, durationMs: 12_000 });
    const providerPhoto = await uploadThroughApi(provider, { purpose: 'chat', conversationId, kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const requestPhoto = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 222 }) });
    const attach = (mediaId: string, senderId: string, expectedKind: 'photo' | 'voice') =>
      db.transaction(client => attachChatMediaInTransaction(client, { mediaId, conversationId, senderId, expectedKind }));

    for (const [mediaId, senderId, kind] of [
      [providerPhoto.id, customerA, 'photo'], // someone else's upload
      [voice.id, customerA, 'photo'], // wrong kind
      [requestPhoto.id, customerA, 'photo'], // request media, not a thread upload
    ] as Array<[string, string, 'photo' | 'voice']>) {
      await expect(attach(mediaId, senderId, kind)).rejects.toMatchObject({ statusCode: 422, code: 'MEDIA_INVALID' });
    }

    expect(await attach(voice.id, customerA, 'voice')).toEqual({ kind: 'voice', durationMs: 12_000 });
    await expect(attach(voice.id, customerA, 'voice')).rejects.toMatchObject({ statusCode: 422, code: 'MEDIA_INVALID' });

    // A voice note stored over the limit it was uploaded under (e.g. a row
    // written by an older build) is refused.
    const long = await uploadThroughApi(customer, { purpose: 'chat', conversationId, kind: 'voice', mime: 'audio/mp4', bytes: voiceBytes, durationMs: 12_000 });
    await database.query('UPDATE job_media SET duration_ms = limit_duration_ms + 1001 WHERE id = $1', [long.id]);
    await expect(attach(long.id, customerA, 'voice')).rejects.toMatchObject({ statusCode: 422, code: 'VOICE_TOO_LONG' });

    const rows = (await database.query('SELECT id, status FROM job_media WHERE purpose = $1 ORDER BY id', ['chat'])).rows;
    expect(rows.find(row => row.id === voice.id)).toEqual({ id: voice.id, status: 'attached' });
    expect(rows.find(row => row.id === providerPhoto.id)).toEqual({ id: providerPhoto.id, status: 'stored' });
    expect(rows.find(row => row.id === long.id)).toEqual({ id: long.id, status: 'stored' });
  });
}, 60000);

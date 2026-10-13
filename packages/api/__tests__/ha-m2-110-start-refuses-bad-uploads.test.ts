// HA-M2-110 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// media plan test 35): starting a request upload is refused, with nothing
// stored, when the declared type does not fit the kind (400
// type_not_allowed), the file is over the size limit (400 too_large), a
// recording is declared longer than the limit or has no length (400 too_long
// / duration_required), or the caller is not a customer (403). Real router,
// validation, auth, service, settings and migration 184 on the guarded
// PostgreSQL fixture.
import crypto from 'node:crypto';
import { bookingIntegrationIt as it, customerA, providerUserA } from './helpers/booking-participant-postgres';
import { adminUser, mediaHttp, withJobMediaDatabase } from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-110: start refuses a kind/mime mismatch, an oversize file, an overlong declared duration and a non-customer role', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const start = (http: ReturnType<typeof mediaHttp>, body: Record<string, unknown>) =>
      http.start({ clientUploadId: crypto.randomUUID(), ...body });

    const mismatch = await start(customer, { kind: 'photo', mime: 'video/mp4', totalBytes: 1000 });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe('type_not_allowed');
    const voiceAsVideo = await start(customer, { kind: 'video', mime: 'audio/mp4', totalBytes: 1000, durationMs: 1000 });
    expect(voiceAsVideo.body.error.code).toBe('type_not_allowed');

    const tooBig = await start(customer, { kind: 'photo', mime: 'image/jpeg', totalBytes: 10485761 });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.error).toMatchObject({ code: 'too_large', limitBytes: 10485760 });
    const bigVoice = await start(customer, { kind: 'voice', mime: 'audio/mp4', totalBytes: 2097153, durationMs: 1000 });
    expect(bigVoice.body.error.code).toBe('too_large');

    const tooLong = await start(customer, { kind: 'video', mime: 'video/mp4', totalBytes: 1000, durationMs: 31_001 });
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error).toMatchObject({ code: 'too_long', limitDurationMs: 30_000 });
    const longVoice = await start(customer, { kind: 'voice', mime: 'audio/webm;codecs=opus', totalBytes: 1000, durationMs: 61_001 });
    expect(longVoice.body.error.code).toBe('too_long');
    const noLength = await start(customer, { kind: 'voice', mime: 'audio/mp4', totalBytes: 1000 });
    expect(noLength.body.error.code).toBe('duration_required');

    for (const [userId, role] of [[providerUserA, 'provider'], [adminUser, 'admin']] as const) {
      const refused = await start(mediaHttp(userId, role), { kind: 'photo', mime: 'image/jpeg', totalBytes: 1000 });
      expect(refused.status).toBe(403);
    }

    // Within the limits (and audio/x-m4a read as audio/mp4) the same customer is accepted.
    const ok = await start(customer, { kind: 'voice', mime: 'audio/x-m4a', totalBytes: 2097152, durationMs: 61_000 });
    expect(ok.status).toBe(201);
    const rows = (await database.query('SELECT owner_user_id, kind, declared_mime, limit_duration_ms FROM job_media')).rows;
    expect(rows).toEqual([{ owner_user_id: customerA, kind: 'voice', declared_mime: 'audio/mp4', limit_duration_ms: 60_000 }]);
  });
}, 60000);

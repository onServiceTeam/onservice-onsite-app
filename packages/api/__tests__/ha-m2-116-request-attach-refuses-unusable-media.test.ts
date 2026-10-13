// HA-M2-116 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// number from the P3 block 80-119): the attach exports package P2's
// createJobRequest calls inside its transaction refuse media that cannot go
// on a new request, with the merged.md 2.3 codes, and attach nothing: another
// customer's or a thread upload gives 400 JOB_MEDIA_UNAVAILABLE, an upload
// still in progress 409 JOB_MEDIA_NOT_READY, and media already on a request
// 409 JOB_MEDIA_ALREADY_USED. The owner's stored photos are locked and
// attached together. Real service and migration 184 on the guarded
// PostgreSQL fixture.
import crypto from 'node:crypto';
import { db } from '../src/models/db';
import {
  attachMediaInTransaction, lockAttachableMediaInTransaction,
} from '../src/services/job-media.service';
import {
  bookingIntegrationIt as it, customerA, customerB, providerA, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  createConversation, createQuoteRequest, mediaHttp, submitQuote, syntheticJpeg, uploadThroughApi, withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

async function attach(ownerUserId: string, bookingId: string, mediaIds: string[]) {
  return db.transaction(async client => {
    const locked = await lockAttachableMediaInTransaction(client, ownerUserId, mediaIds);
    await attachMediaInTransaction(client, bookingId, mediaIds);
    return locked;
  });
}

it('HA-M2-116: request attach refuses foreign, unfinished and already-used media with the plan codes and attaches nothing', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const customer = mediaHttp(customerA, 'customer');
    const first = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const second = await uploadThroughApi(customer, { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 333 }) });
    const foreign = await uploadThroughApi(mediaHttp(customerB, 'customer'), { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 444 }) });
    const unfinished = await customer.start({ kind: 'photo', mime: 'image/jpeg', totalBytes: 5000, clientUploadId: crypto.randomUUID() });
    const bookingId = await createQuoteRequest(database);
    await submitQuote(database, bookingId, providerA);
    const conversationId = await createConversation(database, bookingId, customerA, providerUserA);
    const threadPhoto = await uploadThroughApi(customer, {
      purpose: 'chat', conversationId, kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 555 }),
    });
    const statuses = async () => (await database.query(
      'SELECT id, status, booking_id FROM job_media ORDER BY id',
    )).rows;
    const before = await statuses();

    for (const [ids, status, code] of [
      [[first.id, foreign.id], 400, 'JOB_MEDIA_UNAVAILABLE'],
      [[first.id, threadPhoto.id], 400, 'JOB_MEDIA_UNAVAILABLE'],
      [[first.id, 'not-a-media-id'], 400, 'JOB_MEDIA_UNAVAILABLE'],
      [[first.id, unfinished.body.data.id], 409, 'JOB_MEDIA_NOT_READY'],
    ] as Array<[string[], number, string]>) {
      await expect(attach(customerA, bookingId, ids)).rejects.toMatchObject({ statusCode: status, code });
    }
    expect(await statuses()).toEqual(before);

    const locked = await attach(customerA, bookingId, [second.id, first.id, first.id]);
    expect(locked.map(item => item.id).sort()).toEqual([first.id, second.id].sort());
    expect(locked.every(item => item.kind === 'photo')).toBe(true);
    const attached = (await statuses()).filter(row => row.status === 'attached').map(row => row.id).sort();
    expect(attached).toEqual([first.id, second.id].sort());

    const otherBooking = await createQuoteRequest(database);
    await expect(attach(customerA, otherBooking, [first.id])).rejects.toMatchObject({ statusCode: 409, code: 'JOB_MEDIA_ALREADY_USED' });
    expect((await database.query('SELECT booking_id FROM job_media WHERE id = $1', [first.id])).rows).toEqual([{ booking_id: bookingId }]);
  });
}, 60000);

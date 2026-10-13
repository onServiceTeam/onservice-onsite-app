// HA-M2-115 (customer human audit 2026-10-13, D38 Milestone 2, package P3;
// merged.md P3 data-management item, number from the P3 block 80-119): a
// user's data export lists the private media they uploaded as metadata only
// (kind, purpose, status, type, size, dates, where attached), never a storage
// key or a link, and leaves out other people's uploads. Thread messages carry
// media_id, media_duration_ms and system_event, NULL before migration 185 and
// read through once those columns exist. The job_media and messages queries
// run on the guarded PostgreSQL fixture (real migration 184 and the real
// 006/123/138 chat tables); the export's other, unrelated tables answer empty.
import { db } from '../src/models/db';
import { gatherUserData } from '../src/services/data-management.service';
import {
  bookingIntegrationIt as it, customerA, customerB, providerUserA,
} from './helpers/booking-participant-postgres';
import {
  attachRequestMedia, createConversation, createQuoteRequest, mediaHttp, syntheticJpeg, uploadThroughApi,
  withJobMediaDatabase,
} from './helpers/job-media-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-115: the data export lists the user’s own media as metadata and the thread media columns', async () => {
  await withJobMediaDatabase(async ({ database }) => {
    const mine = await uploadThroughApi(mediaHttp(customerA, 'customer'), { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg() });
    const bookingId = await createQuoteRequest(database);
    await attachRequestMedia(customerA, bookingId, [mine.id]);
    await uploadThroughApi(mediaHttp(customerB, 'customer'), { kind: 'photo', mime: 'image/jpeg', bytes: syntheticJpeg({ scanBytes: 300 }) });
    const conversationId = await createConversation(database, bookingId, customerA, providerUserA);
    await database.query(`INSERT INTO messages (conversation_id, sender_id, content) VALUES ($1, $2, 'Can you send a photo of the unit?')`,
      [conversationId, providerUserA]);

    const realQuery = db.query.bind(db);
    const query = jest.spyOn(db, 'query').mockImplementation((async (sql: string, params?: unknown[]) => {
      if (sql.includes('job_media') || sql.includes('FROM messages m')) return realQuery(sql, params);
      return { rows: [], rowCount: 0 };
    }) as typeof db.query);
    try {
      const before = await gatherUserData(customerA);
      const media = before.jobMedia as Array<Record<string, unknown>>;
      expect(media).toHaveLength(1);
      expect(media[0]).toMatchObject({
        id: mine.id, purpose: 'job_request', booking_id: bookingId, conversation_id: null,
        kind: 'photo', status: 'attached', mime: 'image/jpeg',
      });
      expect(Number(media[0]!.size_bytes)).toBeGreaterThan(0);
      expect(Object.keys(media[0]!)).not.toEqual(expect.arrayContaining(['storage_key']));
      expect(JSON.stringify(before)).not.toContain('private-artifacts/job-media');
      expect(JSON.stringify(before)).not.toContain('/api/v1/job-media/file/');
      const messages = before.messages as Array<Record<string, unknown>>;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({ media_id: null, media_duration_ms: null, system_event: null });

      // A stand-in for the three migration 185 columns: values are read through.
      await database.query(`ALTER TABLE messages ADD COLUMN media_id uuid, ADD COLUMN media_duration_ms integer,
        ADD COLUMN system_event varchar(40)`);
      await database.query(`INSERT INTO messages (conversation_id, sender_id, content, message_type, media_id, media_duration_ms, system_event)
        VALUES ($1, $2, 'Voice message (0:12)', 'image', $3, 12000, NULL),
               ($1, $2, 'Sent a quote.', 'system', NULL, NULL, 'quote_sent')`, [conversationId, providerUserA, mine.id]);
      const after = (await gatherUserData(customerA)).messages as Array<Record<string, unknown>>;
      expect(after.map(row => [row.media_id, row.media_duration_ms, row.system_event]).sort()).toEqual([
        [mine.id, 12000, null], [null, null, null], [null, null, 'quote_sent'],
      ].sort());
    } finally {
      query.mockRestore();
    }
  });
}, 60000);

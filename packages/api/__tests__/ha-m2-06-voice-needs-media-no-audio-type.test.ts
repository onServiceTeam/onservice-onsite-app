// HA-M2-06 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// moved here from P1): after migration 185 the messages table refuses a voice
// message that has no stored recording (media_id) and refuses the unknown type
// 'audio', while a voice message pointing at a job_media row and a plain text
// message are stored. Real migration files on the guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import {
  bookingIntegrationIt as it, bookingA, customerA, providerUserA,
} from './helpers/booking-participant-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const conversation = '87100000-0000-4000-8000-000000000001';
const recording = '87100000-0000-4000-8000-000000000002';

it('HA-M2-06: a voice message without its recording and the message type audio are both refused', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO conversations (id, booking_id, customer_id, provider_id) VALUES ($1, $2, $3, $4)`,
      [conversation, bookingA, customerA, providerUserA]);
    const insert = (type: string, mediaId: string | null) => database.query(
      `INSERT INTO messages (conversation_id, sender_id, content, message_type, media_id, media_duration_ms)
       VALUES ($1, $2, '', $3, $4, $5)`, [conversation, customerA, type, mediaId, mediaId ? 12000 : null]);

    await expect(insert('voice', null))
      .rejects.toMatchObject({ code: '23514', constraint: 'messages_voice_has_media' });
    await expect(insert('audio', null))
      .rejects.toMatchObject({ code: '23514', constraint: 'messages_message_type_check' });
    expect((await database.query('SELECT COUNT(*)::int AS count FROM messages')).rows).toEqual([{ count: 0 }]);

    // The same insert succeeds once the voice note points at its private recording.
    await database.query(`INSERT INTO job_media (id, owner_user_id, purpose, conversation_id, kind, client_upload_id,
        declared_mime, declared_bytes, declared_duration_ms, limit_bytes, limit_duration_ms, chunk_bytes)
      VALUES ($1, $2, 'chat', $3, 'voice', $4, 'audio/mp4', 120000, 12000, 2097152, 60000, 262144)`,
    [recording, customerA, conversation, crypto.randomUUID()]);
    await insert('voice', recording);
    await database.query(`INSERT INTO messages (conversation_id, sender_id, content, message_type)
      VALUES ($1, $2, 'Thanks po', 'text')`, [conversation, providerUserA]);
    expect((await database.query('SELECT message_type, media_id FROM messages ORDER BY message_type')).rows)
      .toEqual([{ message_type: 'text', media_id: null }, { message_type: 'voice', media_id: recording }]);
  }, { through: 185 });
}, 90000);

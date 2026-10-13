// HA-M2-340 (customer human audit 2026-10-13, D38 Milestone 2 wave 3,
// package W3-B): the 185 half of plan test 01. Migration 185 applies to a
// database already populated through 184 and changes no existing value.
//
// The P1 fixer's handoff (HA-M2-01 header): populate conversations and
// messages under withRequestEngineDatabase({ through: 184 }), snapshot every
// column with tableColumns() and tableRows(), apply the real 185 with
// applyRequestEngineMigration(database, 185), and compare. HA-M2-05 covers a
// single legacy conversation together with the new uniqueness rules; this
// test is the populated-database snapshot on its own, across every table 185
// alters or references: three conversations on different bookings, messages
// of every pre-185 type (text, legacy image link, location, system) with the
// 138 moderation columns filled (redacted, reported, flag reviewed), 184 job
// media rows (a request upload and a thread upload), a 183 quote with slot
// and decline columns, an admin audit row and every settings row. After 185,
// every pre-existing column of every row is identical, and the columns 185
// adds read their neutral values ('open', NULL). Real migration files on the
// guarded PostgreSQL fixture.
import crypto from 'node:crypto';
import {
  bookingIntegrationIt as it, bookingA, bookingB, customerA, customerB, operatorId, providerA, providerUserA,
  providerUserB,
} from './helpers/booking-participant-postgres';
import { quoteService, requestCategory } from './helpers/job-request-postgres';
import {
  applyRequestEngineMigration, tableColumns, tableRows, withRequestEngineDatabase,
} from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const quoteRequest = '88400000-0000-4000-8000-000000000001';
const quote = '88400000-0000-4000-8000-000000000002';
const conversationA = '88400000-0000-4000-8000-000000000011';
const conversationB = '88400000-0000-4000-8000-000000000012';
const conversationQuote = '88400000-0000-4000-8000-000000000013';

it('HA-M2-340: migration 185 applied through 184 on a populated database leaves every existing value unchanged', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id,
        budget_max, description, urgency, scheduled_at)
      VALUES ($1, $2, 'quote_based', 'quoted', $3, $4, 250000, 'Aircon will not start', 'within_3_days',
        NOW() + INTERVAL '3 days')`, [quoteRequest, customerA, requestCategory, quoteService]);
    await database.query(`INSERT INTO booking_quotes (id, booking_id, provider_id, quoted_price, description, status,
        expires_at, earliest_date, earliest_time_window, could_change_if)
      VALUES ($1, $2, $3, 180000, 'Clean coils and recharge gas', 'submitted', NOW() + INTERVAL '40 hours',
        CURRENT_DATE + 1, 'morning', 'If the compressor is damaged')`, [quote, quoteRequest, providerA]);
    await database.query(`INSERT INTO conversations (id, booking_id, customer_id, provider_id, is_active, created_at, updated_at)
      VALUES ($1, $4, $6, $8, TRUE, NOW() - INTERVAL '5 days', NOW() - INTERVAL '4 days'),
             ($2, $5, $7, $9, FALSE, NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'),
             ($3, $10, $6, $8, TRUE, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 hour')`,
    [conversationA, conversationB, conversationQuote, bookingA, bookingB, customerA, customerB, providerUserA,
      providerUserB, quoteRequest]);
    await database.query(`INSERT INTO messages (conversation_id, sender_id, content, message_type, image_url, is_read,
        is_flagged, created_at, redacted_at, redacted_by, redaction_reason, reported_at, reported_by, report_reason,
        flag_reviewed_at, flag_reviewed_by)
      VALUES
        ($1, $4, 'Good morning po, is 9 AM fine?', 'text', NULL, TRUE, FALSE, NOW() - INTERVAL '5 days',
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        ($1, $5, 'Photo', 'image', 'https://cdn.example.test/chat/u/p.jpg', TRUE, FALSE, NOW() - INTERVAL '4 days 23 hours',
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        ($1, $4, '10.3157,123.8854', 'location', NULL, FALSE, FALSE, NOW() - INTERVAL '4 days 22 hours',
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        ($1, $7, 'onService support checked in.', 'system', NULL, FALSE, FALSE, NOW() - INTERVAL '4 days 21 hours',
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
        ($2, $6, 'Message me on viber 0917 000 0000', 'text', NULL, FALSE, TRUE, NOW() - INTERVAL '3 days',
         NOW() - INTERVAL '2 days 20 hours', $7, 'Phone number shared', NULL, NULL, NULL,
         NOW() - INTERVAL '2 days 20 hours', $7),
        ($2, $8, 'You were rude to me', 'text', NULL, TRUE, TRUE, NOW() - INTERVAL '2 days 23 hours',
         NULL, NULL, NULL, NOW() - INTERVAL '2 days 22 hours', $6, 'Harassment', NULL, NULL),
        ($3, $4, 'Can you come tomorrow morning?', 'text', NULL, FALSE, FALSE, NOW() - INTERVAL '2 hours',
         NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
    [conversationA, conversationB, conversationQuote, providerUserA, customerA, providerUserB, operatorId, customerB]);
    await database.query(`INSERT INTO job_media (owner_user_id, purpose, booking_id, conversation_id, kind,
        client_upload_id, declared_mime, declared_bytes, declared_duration_ms, limit_bytes, limit_duration_ms,
        chunk_bytes, attached_at)
      VALUES ($1, 'job_request', NULL, NULL, 'photo', $3, 'image/jpeg', 400000, NULL, 10485760, NULL, 2097152, NULL),
             ($1, 'chat', NULL, $2, 'voice', $4, 'audio/mp4', 120000, 12000, 2097152, 60000, 262144, NULL)`,
    [customerA, conversationQuote, crypto.randomUUID(), crypto.randomUUID()]);
    await database.query(`INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details)
      VALUES ($1, 'conversation_viewed', 'booking', $2, $3::jsonb)`,
    [operatorId, bookingB, JSON.stringify({ conversationId: conversationB })]);

    const tables = ['bookings', 'booking_quotes', 'conversations', 'messages', 'job_media', 'admin_actions',
      'platform_settings'] as const;
    const before = new Map<string, { columns: string[]; rows: unknown[] }>();
    for (const table of tables) {
      const columns = await tableColumns(database, table);
      before.set(table, { columns, rows: await tableRows(database, table, columns) });
    }
    expect(before.get('conversations')!.rows).toHaveLength(3);
    expect(before.get('messages')!.rows).toHaveLength(7);
    expect(before.get('job_media')!.rows).toHaveLength(2);
    const settingKeys = (before.get('platform_settings')!.rows as { key: string }[]).map(row => row.key);
    expect(settingKeys).not.toContain('request_threads_enabled');

    await applyRequestEngineMigration(database, 185);

    for (const table of tables) {
      const { columns, rows } = before.get(table)!;
      const where = table === 'platform_settings' ? `key = ANY('{${settingKeys.join(',')}}')` : 'TRUE';
      expect({ table, rows: await tableRows(database, table, columns, where) }).toEqual({ table, rows });
    }
    expect((await database.query(`SELECT DISTINCT state, state_reason, state_changed_at, opened_by_quote_id
        FROM conversations`)).rows).toEqual([
      { state: 'open', state_reason: null, state_changed_at: null, opened_by_quote_id: null },
    ]);
    expect((await database.query(`SELECT DISTINCT media_id, media_duration_ms, system_event, client_message_id
        FROM messages`)).rows).toEqual([
      { media_id: null, media_duration_ms: null, system_event: null, client_message_id: null },
    ]);
  }, { through: 184 });
}, 90000);

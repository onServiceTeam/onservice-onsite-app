// HA-M2-05 (customer human audit 2026-10-13, D38 Milestone 2, package P4;
// moved here from P1): migration 185 applied to a database that already has a
// conversation and messages changes none of their existing values, every
// legacy conversation reads 'open', a second provider's thread on the same
// booking is accepted, and a second thread for the same booking and provider
// is refused. This is also the 185 half of plan test 01 that HA-M2-01 hands
// over (snapshot every column before and after 185). Real migration files on
// the guarded PostgreSQL fixture.
import {
  bookingIntegrationIt as it, bookingA, customerA, providerUserA, providerUserB,
} from './helpers/booking-participant-postgres';
import {
  applyRequestEngineMigration, tableColumns, tableRows, withRequestEngineDatabase,
} from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const legacyConversation = '87000000-0000-4000-8000-000000000001';

it('HA-M2-05: 185 keeps legacy conversations and messages unchanged and open, and allows one thread per provider on a booking', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO conversations (id, booking_id, customer_id, provider_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day')`,
    [legacyConversation, bookingA, customerA, providerUserA]);
    await database.query(`INSERT INTO messages (conversation_id, sender_id, content, message_type, image_url, is_read, is_flagged)
      VALUES ($1, $2, 'Good morning po, is 9 AM fine?', 'text', NULL, TRUE, FALSE),
             ($1, $3, 'Photo', 'image', 'https://cdn.example.test/chat/u/p.jpg', FALSE, FALSE),
             ($1, $3, 'Message me on viber', 'text', NULL, FALSE, TRUE),
             ($1, $2, 'onService support checked in.', 'system', NULL, FALSE, FALSE)`,
    [legacyConversation, providerUserA, customerA]);
    const conversationColumns = await tableColumns(database, 'conversations');
    const messageColumns = await tableColumns(database, 'messages');
    const conversationsBefore = await tableRows(database, 'conversations', conversationColumns);
    const messagesBefore = await tableRows(database, 'messages', messageColumns);

    await applyRequestEngineMigration(database, 185);

    expect(await tableRows(database, 'conversations', conversationColumns)).toEqual(conversationsBefore);
    expect(await tableRows(database, 'messages', messageColumns)).toEqual(messagesBefore);
    expect((await database.query(`SELECT state, state_reason, state_changed_at, opened_by_quote_id
        FROM conversations`)).rows).toEqual([
      { state: 'open', state_reason: null, state_changed_at: null, opened_by_quote_id: null },
    ]);
    expect((await database.query(`SELECT DISTINCT media_id, media_duration_ms, system_event, client_message_id
        FROM messages`)).rows).toEqual([
      { media_id: null, media_duration_ms: null, system_event: null, client_message_id: null },
    ]);

    // A second provider may now hold a thread on the same booking ...
    await database.query(`INSERT INTO conversations (booking_id, customer_id, provider_id) VALUES ($1, $2, $3)`,
      [bookingA, customerA, providerUserB]);
    expect((await database.query('SELECT provider_id FROM conversations WHERE booking_id = $1 ORDER BY created_at',
      [bookingA])).rows).toEqual([{ provider_id: providerUserA }, { provider_id: providerUserB }]);
    // ... but never a second thread for the same booking and provider.
    await expect(database.query(`INSERT INTO conversations (booking_id, customer_id, provider_id) VALUES ($1, $2, $3)`,
      [bookingA, customerA, providerUserA]))
      .rejects.toMatchObject({ code: '23505', constraint: 'conversations_booking_provider_unique' });
    expect((await database.query(`SELECT conname FROM pg_constraint
        WHERE conrelid = 'conversations'::regclass AND contype = 'u' ORDER BY conname`)).rows)
      .toEqual([{ conname: 'conversations_booking_provider_unique' }]);
  }, { through: 184 });
}, 90000);

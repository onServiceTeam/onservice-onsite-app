// HA-M2-01 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// migrations 183 and 184 apply to a database that already holds bookings,
// quote requests, quotes, a conversation and settings, and change none of
// their existing values. The real migration files run on the guarded
// PostgreSQL fixture after the rows are written.
//
// NOT COVERED HERE: the 185 half of plan test 01. The plan's test 01 says
// 183-185 leave existing values unchanged. Migration 185 (request threads) is
// owned by package P4 and did not exist when this file was written, so this
// file applies 183 and 184 only, and 183 and 184 never touch conversations or
// messages. 185 is the migration that does: it drops
// conversations_booking_id_unique and rebuilds the messages message_type
// CHECK. HA-M2-05 and HA-M2-06, as merged.md section 4 defines them, check the
// new rules, not that existing rows keep their values. P4 must add that check
// (reported to the orchestrator by the P1 fixer, 2026-10-14): populate
// conversations and messages under withRequestEngineDatabase({ through: 184 }),
// snapshot every column with tableColumns() and tableRows() from
// helpers/request-engine-postgres, apply 185 with
// applyRequestEngineMigration(database, 185), and compare.
import {
  bookingIntegrationIt as it, bookingA, customerA, customerB, providerA, providerB, providerUserA,
} from './helpers/booking-participant-postgres';
import { quoteService, requestCategory } from './helpers/job-request-postgres';
import {
  applyRequestEngineMigration, tableColumns, tableRows, withRequestEngineDatabase,
} from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const openRequest = '83000000-0000-4000-8000-000000000001';
const quotedRequest = '83000000-0000-4000-8000-000000000002';
const cancelledRequest = '83000000-0000-4000-8000-000000000003';
const conversation = '84000000-0000-4000-8000-000000000001';

it('HA-M2-01: migrations 183 and 184 apply to a populated database and leave every existing booking, quote, conversation and setting value unchanged', async () => {
  await withRequestEngineDatabase(async database => {
    // Quote requests in three states, beside the fixture's paid fixed-price
    // bookings and its accepted quote at payment_pending.
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id,
        budget_min, budget_max, description, urgency, scheduled_at, cancelled_at, cancellation_reason)
      VALUES
        ($1, $4, 'quote_based', 'requested', $6, $7, 150000, 300000, 'Aircon drips water', 'same_day',
         NOW() + INTERVAL '4 hours', NULL, NULL),
        ($2, $4, 'quote_based', 'quoted', $6, $7, NULL, 250000, 'Aircon will not start', 'within_3_days',
         NOW() + INTERVAL '3 days', NULL, NULL),
        ($3, $5, 'quote_based', 'cancelled_by_customer', $6, $7, NULL, NULL, 'Ceiling unit rattles', 'flexible',
         NOW() + INTERVAL '7 days', NOW() - INTERVAL '1 hour', 'Found someone else')`,
    [openRequest, quotedRequest, cancelledRequest, customerA, customerB, requestCategory, quoteService]);
    // A live quote, an old-style decline (no reason) and an expired quote.
    await database.query(`INSERT INTO booking_quotes (booking_id, provider_id, quoted_price, description, status, expires_at)
      VALUES
        ($1, $3, 180000, 'Clean coils and recharge gas', 'submitted', NOW() + INTERVAL '40 hours'),
        ($1, $4, 260000, 'Replace capacitor and fan motor', 'declined', NOW() + INTERVAL '30 hours'),
        ($2, $3, 90000, 'Tighten the mounting bracket', 'expired', NOW() - INTERVAL '2 hours')`,
    [quotedRequest, cancelledRequest, providerA, providerB]);
    await database.query(`INSERT INTO conversations (id, booking_id, customer_id, provider_id)
      VALUES ($1, $2, $3, $4)`, [conversation, bookingA, customerA, providerUserA]);
    await database.query(`INSERT INTO messages (conversation_id, sender_id, content, message_type, image_url, is_flagged)
      VALUES ($1, $2, 'I will arrive at 9', 'text', NULL, FALSE),
             ($1, $3, 'Here is the unit', 'image', 'https://example.test/unit.jpg', TRUE)`,
    [conversation, providerUserA, customerA]);

    const tables = ['bookings', 'booking_quotes', 'conversations', 'messages', 'platform_settings'] as const;
    const before = new Map<string, { columns: string[]; rows: unknown[] }>();
    for (const table of tables) {
      const columns = await tableColumns(database, table);
      before.set(table, { columns, rows: await tableRows(database, table, columns) });
    }
    const settingKeys = (before.get('platform_settings')!.rows as { key: string }[]).map(row => row.key);
    expect(settingKeys).toContain('max_quotes_per_booking');
    expect(before.get('bookings')!.rows).toHaveLength(6);
    expect(before.get('booking_quotes')!.rows).toHaveLength(3);

    await applyRequestEngineMigration(database, 183);
    await applyRequestEngineMigration(database, 184);

    for (const table of ['bookings', 'booking_quotes', 'conversations', 'messages'] as const) {
      const { columns, rows } = before.get(table)!;
      expect(await tableRows(database, table, columns)).toEqual(rows);
    }
    // 183 rewrites only the description of the retired max_quotes_per_booking
    // row; every pre-existing setting keeps its stored value.
    const settingColumns = before.get('platform_settings')!.columns.filter(column => column !== 'description');
    const settingsBefore = (before.get('platform_settings')!.rows as Record<string, unknown>[])
      .map(row => Object.fromEntries(settingColumns.map(column => [column, row[column]])));
    expect(await tableRows(database, 'platform_settings', settingColumns, `key = ANY('{${settingKeys.join(',')}}')`))
      .toEqual(settingsBefore);

    // Existing rows carry the new columns' neutral defaults.
    expect((await database.query(`SELECT DISTINCT budget_unknown, request_round, request_round_opened_at,
        request_declined_rounds, request_ops_review_at, request_ops_review_reason,
        request_still_looking_notified_at, scheduled_window, client_request_id FROM bookings`)).rows)
      .toEqual([{
        budget_unknown: false, request_round: 1, request_round_opened_at: null, request_declined_rounds: 0,
        request_ops_review_at: null, request_ops_review_reason: null, request_still_looking_notified_at: null,
        scheduled_window: null, client_request_id: null,
      }]);
    expect((await database.query(`SELECT DISTINCT round, could_change_if, earliest_date, earliest_time_window,
        accepted_customer_budget, client_request_id, decline_reason, decline_note, declined_at FROM booking_quotes`)).rows)
      .toEqual([{
        round: 1, could_change_if: null, earliest_date: null, earliest_time_window: null,
        accepted_customer_budget: false, client_request_id: null, decline_reason: null, decline_note: null,
        declined_at: null,
      }]);
    expect((await database.query(`SELECT (SELECT count(*)::int FROM job_request_invites) AS invites,
        (SELECT count(*)::int FROM job_media) AS media`)).rows).toEqual([{ invites: 0, media: 0 }]);
  }, { through: 182 });
}, 90000);

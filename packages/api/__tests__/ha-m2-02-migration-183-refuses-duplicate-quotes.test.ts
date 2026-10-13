// HA-M2-02 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// migration 183 enforces one quote per provider per request. It refuses to run
// while one provider holds two quotes on the same request, and leaves nothing
// behind; once the duplicate is resolved by hand, as its error asks, it
// applies, and its unique index (uq_booking_quotes_booking_provider) refuses a
// new second quote from the same provider. The DO-block guard and the index
// are the two halves of that one rule: the guard covers rows that already
// exist, the index covers rows written later. The real migration file runs on
// the guarded PostgreSQL fixture as one statement batch, which Postgres
// executes in one implicit transaction, as the production runner
// (singleTransaction) does.
import {
  bookingIntegrationIt as it, customerA, providerA, providerB,
} from './helpers/booking-participant-postgres';
import { quoteService, requestCategory } from './helpers/job-request-postgres';
import { applyRequestEngineMigration, withRequestEngineDatabase } from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const quotedRequest = '83000000-0000-4000-8000-000000000012';

it('HA-M2-02: migration 183 keeps one quote per provider per request: it aborts on existing duplicates and changes nothing, and once applied it refuses a new duplicate', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id, description)
      VALUES ($1, $2, 'quote_based', 'quoted', $3, $4, 'Aircon will not cool')`,
    [quotedRequest, customerA, requestCategory, quoteService]);
    await database.query(`INSERT INTO booking_quotes (booking_id, provider_id, quoted_price, status, expires_at)
      VALUES ($1, $2, 150000, 'declined', NOW() + INTERVAL '1 day'),
             ($1, $2, 140000, 'submitted', NOW() + INTERVAL '2 days')`, [quotedRequest, providerA]);

    await expect(applyRequestEngineMigration(database, 183)).rejects.toThrow(
      'Migration 183: duplicate (booking_id, provider_id) quotes exist; resolve by hand first.',
    );

    // The earlier statements of the file rolled back with it.
    const schema = await database.query(`SELECT
        (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'bookings'
            AND column_name IN ('budget_unknown', 'request_round', 'client_request_id')) AS booking_columns,
        (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'booking_quotes'
            AND column_name IN ('round', 'decline_reason', 'earliest_date')) AS quote_columns,
        to_regclass('job_request_invites') IS NULL AS no_invite_table,
        (SELECT count(*)::int FROM platform_settings WHERE key LIKE 'request\\_max\\_%') AS request_settings`);
    expect(schema.rows).toEqual([{ booking_columns: 0, quote_columns: 0, no_invite_table: true, request_settings: 0 }]);
    expect((await database.query(`SELECT quoted_price::int, status FROM booking_quotes
      WHERE booking_id = $1 ORDER BY quoted_price`, [quotedRequest])).rows).toEqual([
      { quoted_price: 140000, status: 'submitted' },
      { quoted_price: 150000, status: 'declined' },
    ]);
    expect((await database.query(`SELECT description FROM platform_settings WHERE key = 'max_quotes_per_booking'`)).rows)
      .toEqual([{ description: 'Maximum quotes per job' }]);

    // Resolved by hand: 183 now applies, and the same rule holds for new rows.
    await database.query(`DELETE FROM booking_quotes WHERE booking_id = $1 AND status = 'declined'`, [quotedRequest]);
    await applyRequestEngineMigration(database, 183);
    await expect(database.query(`INSERT INTO booking_quotes (booking_id, provider_id, quoted_price, status, expires_at)
      VALUES ($1, $2, 130000, 'submitted', NOW() + INTERVAL '1 day')`, [quotedRequest, providerA]))
      .rejects.toMatchObject({ code: '23505', constraint: 'uq_booking_quotes_booking_provider' });
    // A different provider on the same request is still accepted.
    await database.query(`INSERT INTO booking_quotes (booking_id, provider_id, quoted_price, status, expires_at)
      VALUES ($1, $2, 120000, 'submitted', NOW() + INTERVAL '1 day')`, [quotedRequest, providerB]);
    expect((await database.query(`SELECT provider_id, quoted_price::int, status FROM booking_quotes
      WHERE booking_id = $1 ORDER BY quoted_price`, [quotedRequest])).rows).toEqual([
      { provider_id: providerB, quoted_price: 120000, status: 'submitted' },
      { provider_id: providerA, quoted_price: 140000, status: 'submitted' },
    ]);
  }, { through: 182 });
}, 90000);

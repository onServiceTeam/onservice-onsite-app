// HA-M2-04 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// after migration 183, a customer decline must carry both its reason and its
// time (declined_at), while a sibling quote closed as "not selected" (status
// declined with neither) is still accepted. The real migration file runs on
// the guarded PostgreSQL fixture; Postgres enforces the CHECK.
import {
  bookingIntegrationIt as it, customerA, providerA, providerB,
} from './helpers/booking-participant-postgres';
import { quoteService, requestCategory } from './helpers/job-request-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const quotedRequest = '83000000-0000-4000-8000-000000000041';
const declinedQuote = '85000000-0000-4000-8000-000000000041';
const siblingQuote = '85000000-0000-4000-8000-000000000042';

it('HA-M2-04: a decline reason without declined_at is rejected, and a not-selected decline is accepted', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id, description)
      VALUES ($1, $2, 'quote_based', 'quoted', $3, $4, 'Two aircons need cleaning')`,
    [quotedRequest, customerA, requestCategory, quoteService]);
    await database.query(`INSERT INTO booking_quotes (id, booking_id, provider_id, quoted_price, status, expires_at)
      VALUES ($1, $3, $4, 200000, 'submitted', NOW() + INTERVAL '1 day'),
             ($2, $3, $5, 180000, 'submitted', NOW() + INTERVAL '1 day')`,
    [declinedQuote, siblingQuote, quotedRequest, providerA, providerB]);

    await expect(database.query(`UPDATE booking_quotes SET status = 'declined', decline_reason = 'too_expensive'
      WHERE id = $1`, [declinedQuote]))
      .rejects.toMatchObject({ code: '23514', constraint: 'booking_quotes_customer_decline_check' });

    await database.query("UPDATE booking_quotes SET status = 'declined' WHERE id = $1", [siblingQuote]);
    expect((await database.query(`SELECT id, status, decline_reason, declined_at FROM booking_quotes
      ORDER BY id`)).rows).toEqual([
      { id: declinedQuote, status: 'submitted', decline_reason: null, declined_at: null },
      { id: siblingQuote, status: 'declined', decline_reason: null, declined_at: null },
    ]);
  });
}, 90000);

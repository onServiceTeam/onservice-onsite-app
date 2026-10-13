// HA-M2-19 (customer human audit 2026-10-13, D38 Milestone 2, package P1,
// added by the P1 fixer for the review finding that critique L6 had no test):
// after migration 183, deleting a quote also deletes the job_request_invites
// row it answered (quote_id ON DELETE CASCADE), and leaves the request's other
// invites alone. A quoted invite must keep its quote_id (CHECK), so the
// merged plan's ON DELETE SET NULL would make the delete fail instead. The
// real migration file runs on the guarded PostgreSQL fixture; Postgres runs
// the cascade.
import {
  bookingIntegrationIt as it, customerA, providerA, providerB,
} from './helpers/booking-participant-postgres';
import { quoteService, requestCategory } from './helpers/job-request-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const quotedRequest = '83000000-0000-4000-8000-000000000191';
const quote = '85000000-0000-4000-8000-000000000191';

it('HA-M2-19: deleting a quote removes the invite it answered and leaves the other invites', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id, description)
      VALUES ($1, $2, 'quote_based', 'quoted', $3, $4, 'Ceiling fan wobbles')`,
    [quotedRequest, customerA, requestCategory, quoteService]);
    await database.query(`INSERT INTO booking_quotes (id, booking_id, provider_id, quoted_price, status, expires_at)
      VALUES ($1, $2, $3, 120000, 'submitted', NOW() + INTERVAL '1 day')`, [quote, quotedRequest, providerA]);
    await database.query(`INSERT INTO job_request_invites (booking_id, provider_id, round, status, responded_at, quote_id)
      VALUES ($1, $2, 1, 'quoted', NOW(), $3), ($1, $4, 1, 'sent', NULL, NULL)`,
    [quotedRequest, providerA, quote, providerB]);

    const deleted = await database.query('DELETE FROM booking_quotes WHERE id = $1', [quote]);
    expect(deleted.rowCount).toBe(1);

    expect((await database.query(`SELECT provider_id, status, quote_id FROM job_request_invites
      WHERE booking_id = $1`, [quotedRequest])).rows).toEqual([
      { provider_id: providerB, status: 'sent', quote_id: null },
    ]);
  });
}, 90000);

// HA-M2-03 (customer human audit 2026-10-13, D38 Milestone 2, package P1):
// after migration 183, a request marked "not sure of the budget"
// (budget_unknown) cannot also carry a budget. The real migration file runs on
// the guarded PostgreSQL fixture; Postgres enforces the CHECK.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import { quoteService, requestCategory } from './helpers/job-request-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const budgetedRequest = '83000000-0000-4000-8000-000000000031';
const unsureRequest = '83000000-0000-4000-8000-000000000032';

it('HA-M2-03: a quote request cannot be both budget_unknown and carry a budget', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(`INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id,
        description, budget_min, budget_max)
      VALUES ($1, $3, 'quote_based', 'requested', $4, $5, 'Aircon smells of burning', 150000, 300000),
             ($2, $3, 'quote_based', 'requested', $4, $5, 'Aircon smells of burning', NULL, NULL)`,
    [budgetedRequest, unsureRequest, customerA, requestCategory, quoteService]);

    await expect(database.query('UPDATE bookings SET budget_unknown = TRUE WHERE id = $1', [budgetedRequest]))
      .rejects.toMatchObject({ code: '23514', constraint: 'bookings_budget_unknown_check' });
    await expect(database.query(`INSERT INTO bookings (customer_id, booking_type, category_id, subcategory_id,
        description, budget_max, budget_unknown)
      VALUES ($1, 'quote_based', $2, $3, 'Only a top budget', 200000, TRUE)`,
    [customerA, requestCategory, quoteService]))
      .rejects.toMatchObject({ code: '23514', constraint: 'bookings_budget_unknown_check' });

    // The same flag on a request with no budget is the allowed "not sure" case.
    await database.query('UPDATE bookings SET budget_unknown = TRUE WHERE id = $1', [unsureRequest]);
    expect((await database.query(`SELECT id, budget_unknown, budget_min, budget_max FROM bookings
      WHERE id = ANY($1::uuid[]) ORDER BY id`, [[budgetedRequest, unsureRequest]])).rows).toEqual([
      { id: budgetedRequest, budget_unknown: false, budget_min: 150000, budget_max: 300000 },
      { id: unsureRequest, budget_unknown: true, budget_min: null, budget_max: null },
    ]);
  });
}, 90000);

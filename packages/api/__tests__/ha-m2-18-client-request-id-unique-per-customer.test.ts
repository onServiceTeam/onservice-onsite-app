// HA-M2-18 (customer human audit 2026-10-13, D38 Milestone 2, package P1,
// added by the P1 fixer for the review finding that critique M9's index had no
// test): after migration 183, bookings.client_request_id (the customer app's
// idempotency key for POST /bookings/job-request) is unique per customer once
// it is set, through the partial index uq_bookings_customer_client_request. A
// double tap that races past the service's replay check therefore cannot
// store a second request and a second fan-out. Requests without a key (every
// existing row and older apps) and another customer's request with the same
// key are unaffected. The real migration file runs on the guarded PostgreSQL
// fixture; Postgres enforces the index.
import {
  bookingIntegrationIt as it, customerA, customerB,
} from './helpers/booking-participant-postgres';
import { quoteService, requestCategory } from './helpers/job-request-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const clientKey = '87000000-0000-4000-8000-000000000181';
const firstRequest = '83000000-0000-4000-8000-000000000181';
const repeatRequest = '83000000-0000-4000-8000-000000000182';
const otherCustomerRequest = '83000000-0000-4000-8000-000000000183';
const unkeyedRequestOne = '83000000-0000-4000-8000-000000000184';
const unkeyedRequestTwo = '83000000-0000-4000-8000-000000000185';

it('HA-M2-18: a job request client_request_id is unique per customer once set, and requests without one are unaffected', async () => {
  await withRequestEngineDatabase(async database => {
    const insertRequest = (id: string, customerId: string, key: string | null) => database.query(
      `INSERT INTO bookings (id, customer_id, booking_type, status, category_id, subcategory_id, description, client_request_id)
       VALUES ($1, $2, 'quote_based', 'requested', $3, $4, 'Aircon leaks onto the floor', $5)`,
      [id, customerId, requestCategory, quoteService, key],
    );

    await insertRequest(firstRequest, customerA, clientKey);
    await expect(insertRequest(repeatRequest, customerA, clientKey))
      .rejects.toMatchObject({ code: '23505', constraint: 'uq_bookings_customer_client_request' });
    await insertRequest(otherCustomerRequest, customerB, clientKey);
    await insertRequest(unkeyedRequestOne, customerA, null);
    await insertRequest(unkeyedRequestTwo, customerA, null);

    expect((await database.query(`SELECT id, customer_id, client_request_id FROM bookings
      WHERE id = ANY($1::uuid[]) ORDER BY id`,
    [[firstRequest, repeatRequest, otherCustomerRequest, unkeyedRequestOne, unkeyedRequestTwo]])).rows).toEqual([
      { id: firstRequest, customer_id: customerA, client_request_id: clientKey },
      { id: otherCustomerRequest, customer_id: customerB, client_request_id: clientKey },
      { id: unkeyedRequestOne, customer_id: customerA, client_request_id: null },
      { id: unkeyedRequestTwo, customer_id: customerA, client_request_id: null },
    ]);
  });
}, 90000);

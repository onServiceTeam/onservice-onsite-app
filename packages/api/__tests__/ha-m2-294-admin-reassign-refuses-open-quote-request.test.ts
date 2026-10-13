// HA-M2-294 (customer human audit 2026-10-13, D38 Milestone 2, critique M1;
// the admin reassign guard is package P4's): the super admin's reassign route
// refuses a quote request that is still collecting quotes (requested or
// quoted) with 409 QUOTE_REQUEST_NOT_ASSIGNABLE and changes nothing. Before
// D38 it would assign the provider at zero price and leave the live quotes
// open; the customer chooses a provider by accepting a quote. Real route on
// the guarded PostgreSQL fixture (helpers/reassign-postgres.ts, where provider
// B is otherwise eligible to take work).
import {
  bookingIntegrationIt as it, participantSnapshot, providerB,
} from './helpers/booking-participant-postgres';
import { reassignHttp, withReassignDatabase } from './helpers/reassign-postgres';
import { requestBooking, seedQuoteRequest } from './helpers/request-thread-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-294: admin reassign on a quote request in requested or quoted gets 409 and writes nothing', async () => {
  await withReassignDatabase(async database => {
    await seedQuoteRequest(database);
    for (const status of ['quoted', 'requested']) {
      await database.query('UPDATE bookings SET status = $2 WHERE id = $1', [requestBooking, status]);
      const before = {
        ...await participantSnapshot(database),
        quotes: (await database.query('SELECT * FROM booking_quotes ORDER BY id')).rows,
        conversations: (await database.query('SELECT * FROM conversations ORDER BY id')).rows,
      };

      const response = await reassignHttp()(requestBooking, providerB);

      expect(response.status).toBe(409);
      expect(response.body.error).toEqual({
        message: 'This quote request has no accepted quote yet. The customer chooses a pro by accepting a quote.',
        statusCode: 409,
        code: 'QUOTE_REQUEST_NOT_ASSIGNABLE',
      });
      expect({
        ...await participantSnapshot(database),
        quotes: (await database.query('SELECT * FROM booking_quotes ORDER BY id')).rows,
        conversations: (await database.query('SELECT * FROM conversations ORDER BY id')).rows,
      }).toEqual(before);
    }
  });
}, 90000);

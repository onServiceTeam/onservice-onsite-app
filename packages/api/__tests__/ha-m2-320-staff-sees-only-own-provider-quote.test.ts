// HA-M2-320 (customer human audit 2026-10-13, D38 Milestone 2; W3-A overflow
// number for an item the P2 build report left untested): GET
// /api/v1/bookings/:id/quotes for an approved team member (provider_staff)
// assigned to perform the booked job (bookings.performer_staff_id, D23)
// returns only their own provider's quote, never the competing quote or its
// price (merged plan bad news 8, booking.service getBookingQuotesForViewer).
// Compare mode (request_max_open_quotes 5): providers A and B quote, the
// customer books provider A, and provider A's approved staff member is the
// performer. Real HTTP on the guarded PostgreSQL fixture with the real
// migration 131 (provider_staff).
import crypto from 'node:crypto';
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import {
  withRequestFlowDatabase, flowHttp, insertQuoteRequest, upsertPlatformSetting, quoteBody,
  customerA, providerA, providerUserA, providerUserB,
} from './helpers/request-flow-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M2-320: an approved provider-staff member sees only their own provider\'s quote', async () => {
  await withRequestFlowDatabase(async database => {
    await upsertPlatformSetting(database, 'request_max_open_quotes', '5');
    const bookingId = await insertQuoteRequest(database);
    const quoteA = (await flowHttp(providerUserA, 'provider').quote(bookingId)).body.data.id as string;
    expect((await flowHttp(providerUserB, 'provider').quote(bookingId, quoteBody({ quotedPrice: 97300 }))).status).toBe(201);
    expect((await flowHttp(customerA, 'customer').accept(bookingId, quoteA)).status).toBe(200);
    const staffUser = crypto.randomUUID();
    const staffMember = crypto.randomUUID();
    await database.query(`INSERT INTO users (id, role, first_name, last_name) VALUES ($1, 'provider_staff', 'Team', 'Member')`, [staffUser]);
    await database.query(`INSERT INTO provider_staff (id, provider_id, user_id, status) VALUES ($1, $2, $3, 'approved')`,
      [staffMember, providerA, staffUser]);
    await database.query('UPDATE bookings SET performer_staff_id = $2 WHERE id = $1', [bookingId, staffMember]);

    const seen = await flowHttp(staffUser, 'provider_staff').quotes(bookingId);

    expect(seen.status).toBe(200);
    expect(seen.body.data.map((q: { id: string; providerId: string }) => [q.id, q.providerId])).toEqual([[quoteA, providerA]]);
    expect(JSON.stringify(seen.body.data)).not.toContain('97300');
  });
}, 90000);

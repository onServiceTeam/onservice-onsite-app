// HA-REQ-1 (customer human audit 2026-10-13, D38): with request_first_booking
// on, "describe your job" works for every active service, fixed-price ones
// included, and the request still reaches the matching provider.
// D38 Milestone 2 (package P2): a job request now stores the request-engine
// columns of migration 183 and its fan-out records invites, so this file runs
// on withRequestEngineDatabase (the same Milestone 1 fixture plus the real
// migrations 183 and 184). The behaviour under test is unchanged.
import { bookingIntegrationIt as it, customerA, providerUserA } from './helpers/booking-participant-postgres';
import {
  marketplaceHttp, jobRequestBody, waitForLeadFanOut,
  fixedService, hourlyService, perUnitService, quoteService, inactiveService,
} from './helpers/job-request-postgres';
import { withRequestEngineDatabase } from './helpers/request-engine-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const mockPush = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => ({
  ...jest.requireActual('../src/services/notification.service'),
  sendPushNotification: (...args: unknown[]) => mockPush(...args),
}));

beforeEach(() => mockPush.mockClear());

it('HA-REQ-1: with the switch on, a request for a fixed-price service is accepted as a quote request and reaches the provider', async () => {
  await withRequestEngineDatabase(async database => {
    const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({ subcategoryId: fixedService }));

    expect(response.status).toBe(201);
    const bookingId = response.body.data.id as string;
    // Saved as a quote request with no price: the catalog's 50,000 is not used.
    expect((await database.query(`SELECT booking_type, status, subcategory_id, provider_id,
        service_price::text AS price, total_amount::text AS total FROM bookings WHERE id=$1`, [bookingId])).rows)
      .toEqual([{
        booking_type: 'quote_based', status: 'requested', subcategory_id: fixedService, provider_id: null,
        price: '0', total: '0',
      }]);
    await waitForLeadFanOut(mockPush, 1);
    expect(mockPush).toHaveBeenCalledWith(providerUserA, 'New quote request', expect.any(String),
      'new_job_request', expect.objectContaining({ bookingId }));
  }, { requestFirstBooking: 'true' });
}, 60000);

for (const [kind, service] of [['hourly', hourlyService], ['per_unit', perUnitService], ['quote', quoteService]] as const) {
  it(`HA-REQ-1: with the switch on, a request for a ${kind} service is accepted`, async () => {
    await withRequestEngineDatabase(async database => {
      const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({ subcategoryId: service }));

      expect(response.status).toBe(201);
      expect((await database.query('SELECT booking_type, subcategory_id FROM bookings WHERE id=$1',
        [response.body.data.id])).rows).toEqual([{ booking_type: 'quote_based', subcategory_id: service }]);
      await waitForLeadFanOut(mockPush, 1);
    }, { requestFirstBooking: 'true' });
  }, 60000);
}

it('HA-REQ-1: an inactive service is refused even with the switch on, and nothing is saved', async () => {
  await withRequestEngineDatabase(async database => {
    const before = (await database.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n;

    const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({ subcategoryId: inactiveService }));

    expect(response.status).toBe(404);
    expect(response.body.error.message).toBe('This service is not available right now. Choose another service.');
    expect((await database.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n).toBe(before);
    expect(mockPush).not.toHaveBeenCalled();
  }, { requestFirstBooking: 'true' });
}, 60000);

it('HA-REQ-1: a provider account cannot send a service request, and nothing is saved', async () => {
  await withRequestEngineDatabase(async database => {
    const before = (await database.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n;

    const response = await marketplaceHttp(providerUserA, 'provider').jobRequest(jobRequestBody({ subcategoryId: fixedService }));

    expect(response.status).toBe(403);
    expect(response.body.error.message).toBe('Only customer accounts can send a service request.');
    expect((await database.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n).toBe(before);
  }, { requestFirstBooking: 'true' });
}, 60000);

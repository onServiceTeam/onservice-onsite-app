// HA-REQ-2 (customer human audit 2026-10-13, D38): with request_first_booking
// off, job requests keep today's (pre-D38) server rule.
//
// What that rule is: before D38 the server never refused a job request for the
// service's pricing type. The only routing rule lived in the customer app,
// which opened the request form for a service when it was not hourly and was
// quote, per_unit or had no base price. The switch therefore only changes the
// app's routing (requestFirstBooking in GET /api/v1/config). The server keeps
// accepting a request for any active service, so an app that still holds the
// old config value (it caches it for up to about 5 minutes and treats a failed
// load as "on") is never stranded on a form the server refuses. What the old
// rule did refuse, it still refuses with the switch off: here, a request
// outside every active service area.
import { bookingIntegrationIt as it, customerA } from './helpers/booking-participant-postgres';
import {
  withJobRequestDatabase, marketplaceHttp, jobRequestBody, waitForLeadFanOut,
  fixedService, hourlyService, perUnitService, quoteService,
} from './helpers/job-request-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const mockPush = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => ({
  ...jest.requireActual('../src/services/notification.service'),
  sendPushNotification: (...args: unknown[]) => mockPush(...args),
}));

beforeEach(() => mockPush.mockClear());

/** Manila: inside the Philippines, far outside the fixture's Cebu City area. */
const outsideEveryArea = { latitude: 14.5995, longitude: 120.9842 };

for (const [kind, service] of [['fixed-price', fixedService], ['hourly', hourlyService]] as const) {
  it(`HA-REQ-2: with the switch off, a request for a ${kind} service is not refused for its pricing type, as before D38`, async () => {
    await withJobRequestDatabase(async database => {
      const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({ subcategoryId: service }));

      expect(response.status).toBe(201);
      expect((await database.query(
        'SELECT booking_type, status, subcategory_id, total_amount::text AS total_amount FROM bookings WHERE id=$1',
        [response.body.data.id],
      )).rows).toEqual([{ booking_type: 'quote_based', status: 'requested', subcategory_id: service, total_amount: '0' }]);
      await waitForLeadFanOut(mockPush, 1);
    }, { requestFirstBooking: 'false' });
  }, 60000);
}

for (const [kind, service] of [['quote', quoteService], ['per_unit', perUnitService]] as const) {
  it(`HA-REQ-2: with the switch off, a request for a ${kind} service is still accepted as before D38`, async () => {
    await withJobRequestDatabase(async database => {
      const response = await marketplaceHttp(customerA, 'customer').jobRequest(jobRequestBody({ subcategoryId: service }));

      expect(response.status).toBe(201);
      expect((await database.query('SELECT booking_type, status FROM bookings WHERE id=$1',
        [response.body.data.id])).rows).toEqual([{ booking_type: 'quote_based', status: 'requested' }]);
      await waitForLeadFanOut(mockPush, 1);
    }, { requestFirstBooking: 'false' });
  }, 60000);
}

it('HA-REQ-2: with the switch off, a request outside every active service area is still refused as before D38 and nothing is saved', async () => {
  await withJobRequestDatabase(async database => {
    const before = (await database.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n;

    const response = await marketplaceHttp(customerA, 'customer').jobRequest(
      jobRequestBody({ subcategoryId: quoteService, ...outsideEveryArea }),
    );

    expect(response.status).toBe(422);
    expect(response.body.error.message).toBe(
      'onService is not available at this location yet. Choose a location inside an active service area.',
    );
    expect((await database.query('SELECT count(*)::int AS n FROM bookings')).rows[0].n).toBe(before);
    expect(mockPush).not.toHaveBeenCalled();
  }, { requestFirstBooking: 'false' });
}, 60000);

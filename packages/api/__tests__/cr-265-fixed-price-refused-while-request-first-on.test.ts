// CR-265 (customer review 2026-10-17, slice P2, finish-path-7/8; D41 Q39
// option a): while request-first booking is on (and has been for longer than
// the apps' config cache), a new fixed-price booking from an old app or a
// direct call is refused with "Please update the app." before anything else
// is read or written: no booking row is created. Real booking router, real
// authentication middleware, the real migration 182 row and real SQL on the
// guarded PostgreSQL fixture.
import {
  catalogCategory, catalogService, customerUser, p2Http, p2It as it, setSettingRow, withP2Database,
} from './helpers/p2-switches-postgres';
import bookingRouter from '../src/routes/booking.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const fixedPriceBody = {
  categoryId: catalogCategory,
  subcategoryId: catalogService,
  bookingType: 'fixed_price',
  description: 'Deep clean of a two-bedroom condo unit.',
  address: 'Unit 12B, Mango Square Residences',
  barangay: 'Lahug',
  city: 'Cebu City',
  province: 'Cebu',
  latitude: 10.3317,
  longitude: 123.8977,
  scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
};

it('Bug CR-265 — with request-first booking on, a fixed-price booking is refused with "Please update the app." and nothing is stored', async () => {
  await withP2Database(async database => {
    // On, and saved an hour ago: well past the grace for cached app config.
    await setSettingRow(database, 'request_first_booking', 'true', 60);
    const http = p2Http([['/api/v1/bookings', bookingRouter]]);

    const response = await http.post('/api/v1/bookings', fixedPriceBody, { userId: customerUser, role: 'customer' });

    expect(response.status).toBe(409);
    expect(response.body.error).toEqual({ message: 'Please update the app.', statusCode: 409, code: 'APP_UPDATE_REQUIRED' });
    expect((await database.query('SELECT COUNT(*)::int AS n FROM bookings')).rows[0].n).toBe(0);
  });
}, 90000);

// CR-273 (customer review 2026-10-17, slice P2, finish-path-7/8, fix round;
// D41 Q39 option a): every recurring booking is a fixed-price booking. While
// request-first booking is on (and past the short grace for cached app
// config), starting a new recurring series from a completed fixed-price
// booking is refused with a plain message, and no series is stored. Real
// recurring router, real authentication middleware, the real migration 182
// row and real SQL on the guarded PostgreSQL fixture, with the recurring
// tables added. The second half shows the same request is accepted with the
// switch off, so the refusal is about the switch and not the fixture.
import {
  addRecurringTables, catalogCategory, catalogService, customerUser, p2Http, p2It as it, setSettingRow,
  withP2Database,
} from './helpers/p2-switches-postgres';
import recurringRouter from '../src/routes/recurring.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const sourceBooking = 'c5000000-0000-4000-8000-000000000273';
const seriesBody = {
  categoryId: catalogCategory,
  subcategoryId: catalogService,
  originalBookingId: sourceBooking,
  frequency: 'weekly',
  preferredDay: 2,
  preferredTime: '09:00',
  address: 'Unit 12B, Mango Square Residences',
  barangay: 'Lahug',
  city: 'Cebu City',
  province: 'Cebu',
};

it('Bug CR-273 — with request-first booking on, a new recurring series is refused and nothing is stored', async () => {
  await withP2Database(async database => {
    await addRecurringTables(database);
    await database.query(
      `INSERT INTO bookings (id, customer_id, status, category_id, subcategory_id, booking_type)
       VALUES ($1, $2, 'confirmed', $3, $4, 'fixed_price')`,
      [sourceBooking, customerUser, catalogCategory, catalogService],
    );
    const http = p2Http([['/api/v1/recurring', recurringRouter]]);
    const customer = { userId: customerUser, role: 'customer' };
    const seriesCount = async (): Promise<number> =>
      (await database.query('SELECT COUNT(*)::int AS n FROM recurring_bookings')).rows[0].n;

    // On, and saved an hour ago: well past the grace for cached app config.
    await setSettingRow(database, 'request_first_booking', 'true', 60);
    const refused = await http.post('/api/v1/recurring', seriesBody, customer);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toEqual({
      message: 'Recurring bookings are not available right now. Please send a new request instead.',
      statusCode: 409,
      code: 'recurring_not_available',
    });
    expect(await seriesCount()).toBe(0);

    // Off: the same request starts the series as before.
    await setSettingRow(database, 'request_first_booking', 'false', 60);
    const accepted = await http.post('/api/v1/recurring', seriesBody, customer);
    expect(accepted.status).toBe(201);
    expect(accepted.body.data).toMatchObject({ customerId: customerUser, originalBookingId: sourceBooking });
    expect(await seriesCount()).toBe(1);
  });
}, 90000);

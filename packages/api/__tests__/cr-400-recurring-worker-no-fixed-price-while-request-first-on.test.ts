// CR-400 (customer review 2026-10-17, slice P2, finish-path-7/8, fix round;
// D41 Q39 option a): the daily recurring worker writes fixed-price bookings
// straight into the bookings table. While request-first booking is on (and
// past the short grace for cached app config), it makes no booking from a
// series that is due: no booking, no claimed cycle, and the series is left
// exactly as it was (same next date, same count), so nothing is lost if the
// switch is turned off. The second half shows the worker does take up the
// same series with the switch off (it claims the cycle and moves the series
// on), so the skip is about the switch and not the fixture. It does not check
// the booking made in that case: the worker has a separate, older problem
// reading the series date that is reported for a later slice. Real worker and
// real SQL on the guarded PostgreSQL fixture, with the recurring tables
// added; only the customer notice is stubbed.
import {
  addRecurringTables, catalogCategory, catalogService, customerUser, p2It as it, setSettingRow,
  withP2Database,
} from './helpers/p2-switches-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: jest.fn().mockResolvedValue(undefined),
}));

import { processRecurringBookings } from '../src/services/recurring.service';

const series = 'c6000000-0000-4000-8000-000000000300';

it('Bug CR-400 — with request-first booking on, the recurring worker makes no fixed-price booking and leaves the series as it was', async () => {
  await withP2Database(async database => {
    await addRecurringTables(database);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    await database.query(
      `INSERT INTO recurring_bookings (id, customer_id, category_id, subcategory_id, frequency, preferred_day,
          preferred_time, address, barangay, city, province, service_price, service_fee, total_amount,
          next_booking_date)
       VALUES ($1, $2, $3, $4, 'weekly', 2, '09:00', 'Unit 12B, Mango Square Residences', 'Lahug',
          'Cebu City', 'Cebu', 150000, 15000, 165000, $5)`,
      [series, customerUser, catalogCategory, catalogService, today],
    );
    const state = async (): Promise<unknown> => ({
      bookings: (await database.query(
        `SELECT booking_type, status FROM bookings WHERE customer_id = $1`, [customerUser])).rows,
      instances: (await database.query('SELECT COUNT(*)::int AS n FROM recurring_instances')).rows[0].n,
      series: (await database.query(
        `SELECT next_booking_date::text AS next, total_instances FROM recurring_bookings WHERE id = $1`,
        [series])).rows[0],
    });

    // On, and saved an hour ago: well past the grace for cached app config.
    await setSettingRow(database, 'request_first_booking', 'true', 60);
    expect(await processRecurringBookings()).toBe(0);
    expect(await state()).toEqual({ bookings: [], instances: 0, series: { next: today, total_instances: 0 } });

    // Off: the worker takes up the same due series (claims this cycle
    // and moves the series to its next date).
    await setSettingRow(database, 'request_first_booking', 'false', 60);
    await processRecurringBookings();
    const after = await state() as { instances: number; series: { next: string } };
    expect(after.instances).toBe(1);
    expect(after.series.next).not.toBe(today);
  });
}, 90000);

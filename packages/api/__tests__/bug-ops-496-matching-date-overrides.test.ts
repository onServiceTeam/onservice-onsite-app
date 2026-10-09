import { findMatchingProviders, findMatchingProvidersSimple } from '../src/services/matching.service';
import { addAvailabilityOverride, removeAvailabilityOverride, setSchedule } from '../src/services/provider.service';
import { availabilityIntegrationIt as it, withAvailabilityDatabase, providerId, otherProviderId, categoryId, subcategoryId } from './helpers/provider-availability-postgres';

jest.mock('../src/services/settings.service', () => ({
  getSetting: jest.fn().mockResolvedValue('{"new":0}'),
  getSettingNumber: jest.fn().mockResolvedValue(2.5),
  getSettingInteger: jest.fn().mockResolvedValue(5),
}));

it('Bug OPS-496 — both matchers honor the Manila-date override before weekly hours without changing existing bookings', async () => {
  await withAvailabilityDatabase(async database => {
    // Thursday 06:00 in Manila is Wednesday 22:00 UTC.
    const scheduled = new Date('2099-08-06T06:00:00+08:00');
    const date = scheduled.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    await setSchedule(providerId, [{ dayOfWeek: day, startTime: '05:00', endTime: '08:00', isAvailable: true }]);
    await database.query(`INSERT INTO bookings (provider_id,status,scheduled_at,total_amount)
      VALUES ($1,'confirmed',$2,12345)`, [providerId, scheduled]);
    const existingBookings = (await database.query('SELECT * FROM bookings')).rows;
    const matches = [
      () => findMatchingProviders(categoryId, subcategoryId, 10.3, 123.9, scheduled),
      () => findMatchingProviders(categoryId, null, 10.3, 123.9, scheduled),
      () => findMatchingProvidersSimple(categoryId, 10.3, 123.9, scheduled),
    ];
    async function expectMatches(expected: boolean): Promise<void> {
      for (const match of matches) expect((await match()).map(row => row.providerId)).toEqual(expected ? [providerId] : []);
    }
    await expectMatches(true);
    const block = await addAvailabilityOverride(providerId, { overrideDate: date, isAvailable: false });
    await expectMatches(false);
    await removeAvailabilityOverride(providerId, block.id);
    await expectMatches(true);
    await addAvailabilityOverride(providerId, { overrideDate: date, isAvailable: true, startTime: '09:00', endTime: '10:00' });
    await expectMatches(false);
    await setSchedule(providerId, [{ dayOfWeek: day, startTime: '09:00', endTime: '17:00', isAvailable: false }]);
    const custom = await addAvailabilityOverride(providerId, { overrideDate: date, isAvailable: true, startTime: '06:00', endTime: '07:00' });
    await expectMatches(true);
    await database.query('UPDATE providers SET is_available=FALSE WHERE id=$1', [providerId]);
    await expectMatches(false);
    await database.query("UPDATE providers SET is_available=TRUE,status='suspended' WHERE id=$1", [providerId]);
    await expectMatches(false);
    await database.query("UPDATE providers SET status='approved' WHERE id=$1", [providerId]);
    await removeAvailabilityOverride(providerId, custom.id);
    await expectMatches(false);
    await setSchedule(providerId, [{ dayOfWeek: day, startTime: '05:00', endTime: '08:00', isAvailable: true }]);
    await addAvailabilityOverride(otherProviderId, { overrideDate: date, isAvailable: false });
    await addAvailabilityOverride(providerId, { overrideDate: scheduled.toISOString().slice(0, 10), isAvailable: false });
    await expectMatches(true); // other owner and UTC previous date cannot block this Manila date
    // Legacy incomplete custom windows must not fall back to weekly availability.
    await database.query('INSERT INTO provider_availability_overrides (provider_id,override_date,is_available) VALUES ($1,$2,TRUE)', [providerId, date]);
    await expectMatches(false);
    await addAvailabilityOverride(providerId, { overrideDate: date, isAvailable: false });
    await database.query(`INSERT INTO provider_availability_overrides
      (provider_id,override_date,is_available,start_time,end_time) VALUES ($1,$2,TRUE,'05:00','08:00')`, [providerId, date]);
    await expectMatches(false); // a legacy custom window cannot defeat an explicit block
    expect((await database.query('SELECT * FROM bookings')).rows).toEqual(existingBookings);
  });
}, 30000);

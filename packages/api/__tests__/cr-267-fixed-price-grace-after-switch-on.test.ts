// CR-267 (customer review 2026-10-17, slice P2, finish-path-7/8; D41 Q39):
// the refusal of old fixed-price bookings allows for the apps' config cache.
// Customer apps keep the config for 5 minutes and the server caches a setting
// for 60 seconds, so for 10 minutes after request_first_booking was last
// saved, fixed-price bookings are still accepted; after that they are
// refused. Switched off, they are never refused. A missing row counts as on
// (the D38 default). The real isFixedPriceBookingRetired reads the real
// migration 182 row's updated_at on the guarded PostgreSQL fixture.
import { p2It as it, setSettingRow, withP2Database } from './helpers/p2-switches-postgres';
import { REQUEST_FIRST_SWITCH_GRACE_MINUTES, isFixedPriceBookingRetired } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-267 — for 10 minutes after request-first is switched on, fixed-price bookings are still accepted', async () => {
  await withP2Database(async database => {
    expect(REQUEST_FIRST_SWITCH_GRACE_MINUTES).toBe(10);
    const retiredWhen = async (value: string, minutesAgo: number): Promise<boolean> => {
      await setSettingRow(database, 'request_first_booking', value, minutesAgo);
      return isFixedPriceBookingRetired();
    };

    expect({
      onJustSaved: await retiredWhen('true', 0),
      onNineMinutesAgo: await retiredWhen('true', 9),
      onElevenMinutesAgo: await retiredWhen('true', 11),
      onLongAgo: await retiredWhen('true', 24 * 60),
      offJustSaved: await retiredWhen('false', 0),
      offLongAgo: await retiredWhen('false', 24 * 60),
    }).toEqual({
      onJustSaved: false,
      onNineMinutesAgo: false,
      onElevenMinutesAgo: true,
      onLongAgo: true,
      offJustSaved: false,
      offLongAgo: false,
    });

    await database.query("DELETE FROM platform_settings WHERE key = 'request_first_booking'");
    expect(await isFixedPriceBookingRetired()).toBe(true);
  });
}, 90000);

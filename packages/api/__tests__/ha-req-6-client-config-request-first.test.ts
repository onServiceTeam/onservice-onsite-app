// HA-REQ-6 (customer human audit 2026-10-13, D38): the public client config
// tells the apps whether every service starts with "describe your job". It
// defaults to true; only the stored value 'false' turns it off. Real
// platform_settings rows on the guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { withJobRequestDatabase } from './helpers/job-request-postgres';
import { getClientConfig } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-REQ-6: getClientConfig returns requestFirstBooking true when no request_first_booking row exists', async () => {
  await withJobRequestDatabase(async database => {
    expect((await database.query("SELECT count(*)::int AS n FROM platform_settings WHERE key='request_first_booking'"))
      .rows).toEqual([{ n: 0 }]);

    const config = await getClientConfig();

    expect(config.requestFirstBooking).toBe(true);
  });
}, 60000);

it("HA-REQ-6: getClientConfig returns requestFirstBooking true when the setting is 'true'", async () => {
  await withJobRequestDatabase(async () => {
    const config = await getClientConfig();

    expect(config.requestFirstBooking).toBe(true);
  }, { requestFirstBooking: 'true' });
}, 60000);

it("HA-REQ-6: getClientConfig returns requestFirstBooking false when the setting is 'false'", async () => {
  await withJobRequestDatabase(async () => {
    const config = await getClientConfig();

    expect(config.requestFirstBooking).toBe(false);
  }, { requestFirstBooking: 'false' });
}, 60000);

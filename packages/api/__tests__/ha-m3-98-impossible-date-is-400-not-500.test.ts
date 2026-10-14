// HA-M3-98 (customer human audit 2026-10-13, D38 Milestone 3, integrated
// review 2026-10-14): a date that has the YYYY-MM-DD shape but is not a real
// day (month 13, day 32) is refused with 400 "Dates must be real calendar
// days", not a 500. Before the fix the range helper derived the missing end
// from the impossible day first, which threw a RangeError. Real HTTP on the
// guarded PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { adminUser, marketplaceAdminHttp, withMarketplaceDatabase } from './helpers/marketplace-health-postgres';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-98: an impossible from or to date on its own answers 400, not 500', async () => {
  await withMarketplaceDatabase(async () => {
    const http = marketplaceAdminHttp(adminUser, 'admin');
    for (const path of [
      '/lost-opportunities?from=2026-13-01',
      '/response-times?to=2026-01-32',
      '/providers?from=2026-02-30',
    ]) {
      const response = await http.get(path);
      expect({ path, status: response.status }).toEqual({ path, status: 400 });
      expect(JSON.stringify(response.body)).toContain('Dates must be real calendar days');
    }
  });
}, 90000);

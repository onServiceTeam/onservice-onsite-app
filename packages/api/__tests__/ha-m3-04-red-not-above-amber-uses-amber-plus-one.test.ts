// HA-M3-04 (customer human audit 2026-10-13, D38 Milestone 3, package M3-API):
// getMarketplaceAlertPolicy keeps red after amber. A stored red value that is
// not above the stored amber value resolves to amber + 1, so a request can
// never turn red before it turned amber; a red value above amber is used as
// stored. The real settings service reads the real 186 rows on the guarded
// PostgreSQL fixture.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { upsertPlatformSetting } from './helpers/request-engine-postgres';
import { withMarketplaceDatabase } from './helpers/marketplace-health-postgres';
import { getMarketplaceAlertPolicy } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('HA-M3-04: a red threshold that is not above amber is read as amber + 1', async () => {
  await withMarketplaceDatabase(async database => {
    const thresholds = async (amber: string, red: string) => {
      await upsertPlatformSetting(database, 'ops_request_alert_amber_minutes', amber);
      await upsertPlatformSetting(database, 'ops_request_alert_red_minutes', red);
      const policy = await getMarketplaceAlertPolicy();
      return [policy.amberMinutes, policy.redMinutes];
    };

    expect(await thresholds('8', '6')).toEqual([8, 9]);
    expect(await thresholds('8', '8')).toEqual([8, 9]);
    expect(await thresholds('7', '12')).toEqual([7, 12]);
  });
}, 90000);

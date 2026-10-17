// CR-268 (customer review 2026-10-17, slice P2; D41 Q32 and Q33): the public
// client config (GET /api/v1/config) tells the apps whether referral bonuses
// and Suki are on, so the screens can show "Not available right now". Both
// are false by default (migration 188) and follow the stored rows, and they
// come from the same single bulk settings query as every other config value
// (MED-N107). Real getClientConfig, real migration 188 rows, guarded
// PostgreSQL fixture; the query count is observed on the real pool.
import { bookingIntegrationIt as it } from './helpers/booking-participant-postgres';
import { readMigration, upsertPlatformSetting, withRequestEngineDatabase } from './helpers/request-engine-postgres';
import { pool } from '../src/config/database.config';
import { getClientConfig } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

it('Bug CR-268 — the app config says referral bonuses and Suki are off by default, from its one bulk settings query', async () => {
  await withRequestEngineDatabase(async database => {
    await database.query(readMigration('188_referral_suki_invited_testers_switches.sql'));

    const statements: string[] = [];
    const realQuery = pool.query;
    pool.query = ((text: string, params?: unknown[]) => {
      statements.push(text);
      return (realQuery as (t: string, p?: unknown[]) => Promise<unknown>)(text, params);
    }) as typeof pool.query;
    let config: Record<string, unknown>;
    try {
      config = await getClientConfig();
    } finally {
      pool.query = realQuery;
    }
    expect(statements).toHaveLength(2);
    expect(config).toMatchObject({ referralProgramEnabled: false, sukiProgramEnabled: false });

    await upsertPlatformSetting(database, 'referral_program_enabled', 'true');
    await upsertPlatformSetting(database, 'suki_program_enabled', 'true');
    expect(await getClientConfig()).toMatchObject({ referralProgramEnabled: true, sukiProgramEnabled: true });
  });
}, 90000);

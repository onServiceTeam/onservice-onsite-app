// CR-261 (customer review 2026-10-17, slice P2; D41 Q33 option a): the Suki
// off switch is read-only in admin while E25 and D29 are open. Admin shows it
// as a launch hold with the reason, and a super admin's attempt to switch it
// on is refused with the value unchanged. Real admin settings router on the
// guarded PostgreSQL fixture, with the real migration 188 row.
import { p2Http, p2It as it, superAdminUser, withP2Database } from './helpers/p2-switches-postgres';
import settingsRouter from '../src/routes/settings.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const superAdmin = { userId: superAdminUser, role: 'super_admin' };

it('Bug CR-261 — the Suki switch is shown as a launch hold in admin and cannot be turned on', async () => {
  await withP2Database(async database => {
    const http = p2Http([['/api/v1/admin/settings', settingsRouter]]);
    const listing = await http.get('/api/v1/admin/settings', superAdmin);
    const row = (listing.body.data.settings.loyalty as Array<Record<string, unknown>>)
      .find((setting) => setting.key === 'suki_program_enabled');
    expect(row).toMatchObject({ value: 'false', editable: false, runtimeStatus: 'held', runtimeLabel: 'Launch hold' });
    expect(String(row!.runtimeSummary)).toContain('E25 and D29');

    const updatedAt = (await database.query<{ updated_at: Date }>(
      "SELECT updated_at FROM platform_settings WHERE key = 'suki_program_enabled'",
    )).rows[0]!.updated_at.toISOString();
    const turnOn = await http.put('/api/v1/admin/settings/suki_program_enabled', {
      value: 'true', reason: 'Trying to switch Suki rewards on.', expectedUpdatedAt: updatedAt,
    }, superAdmin);
    expect(turnOn.status).toBe(409);
    expect(turnOn.body.error.message).toMatch(/^Setting "suki_program_enabled" is read-only:/);
    expect((await database.query("SELECT value FROM platform_settings WHERE key = 'suki_program_enabled'")).rows[0].value)
      .toBe('false');
  });
}, 90000);

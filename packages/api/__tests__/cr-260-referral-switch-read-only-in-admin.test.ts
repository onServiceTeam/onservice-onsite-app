// CR-260 (customer review 2026-10-17, slice P2; D41 Q32 option a): the
// referral off switch is read-only in admin for now. Admin shows it as a
// launch hold with the reason (it stays off until Ken decides the rules), and
// a super admin's attempt to switch it on, or to reset it, is refused with
// the value unchanged. Real admin settings router on the guarded PostgreSQL
// fixture, with the real migration 188 row.
import { p2Http, p2It as it, superAdminUser, withP2Database } from './helpers/p2-switches-postgres';
import settingsRouter from '../src/routes/settings.routes';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const superAdmin = { userId: superAdminUser, role: 'super_admin' };

it('Bug CR-260 — the referral switch is shown as a launch hold in admin and cannot be turned on', async () => {
  await withP2Database(async database => {
    const http = p2Http([['/api/v1/admin/settings', settingsRouter]]);
    const listing = await http.get('/api/v1/admin/settings', superAdmin);
    const row = (listing.body.data.settings.marketing as Array<Record<string, unknown>>)
      .find((setting) => setting.key === 'referral_program_enabled');
    expect(row).toMatchObject({ value: 'false', editable: false, runtimeStatus: 'held', runtimeLabel: 'Launch hold' });
    expect(String(row!.runtimeSummary)).toContain('until Ken decides the rules');

    const updatedAt = (await database.query<{ updated_at: Date }>(
      "SELECT updated_at FROM platform_settings WHERE key = 'referral_program_enabled'",
    )).rows[0]!.updated_at.toISOString();
    const turnOn = await http.put('/api/v1/admin/settings/referral_program_enabled', {
      value: 'true', reason: 'Trying to switch referral bonuses on.', expectedUpdatedAt: updatedAt,
    }, superAdmin);
    expect(turnOn.status).toBe(409);
    expect(turnOn.body.error.message).toMatch(/^Setting "referral_program_enabled" is read-only:/);
    const reset = await http.post('/api/v1/admin/settings/referral_program_enabled/reset', {
      reason: 'Trying to reset referral bonuses.', expectedUpdatedAt: updatedAt,
    }, superAdmin);
    expect(reset.status).toBe(409);

    const stored = (await database.query(`SELECT value,
        (SELECT COUNT(*)::int FROM platform_settings_audit WHERE setting_key = 'referral_program_enabled') AS audits
      FROM platform_settings WHERE key = 'referral_program_enabled'`)).rows[0];
    expect(stored).toEqual({ value: 'false', audits: 0 });
  });
}, 90000);

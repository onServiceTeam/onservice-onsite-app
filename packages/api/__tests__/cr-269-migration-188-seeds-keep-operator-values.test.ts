// CR-269 (customer review 2026-10-17, slice P2): migration 188 seeds the
// referral switch and the Suki switch off, the invited-testers setting on
// with its message, matching the in-memory fallbacks in SETTING_DEFAULTS
// (so the boot drift check stays clean and an outage falls back to the same
// values), and it never overwrites a value an operator already holds: a row
// that exists before 188 runs keeps its value, and running 188 again changes
// nothing. The real migration file on the guarded PostgreSQL fixture.
import { MIGRATION_188, p2It as it, readMigration, withP2Database } from './helpers/p2-switches-postgres';
import { SETTING_DEFAULTS } from '../src/services/settings.service';

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const KEYS = ['invited_testers_message', 'invited_testers_only', 'referral_program_enabled', 'suki_program_enabled'];

it('Bug CR-269 — migration 188 seeds the four switch rows to their code defaults and keeps an operator value', async () => {
  await withP2Database(async database => {
    // An operator's words already stored before 188 runs.
    await database.query(`INSERT INTO platform_settings (category, key, label, value_type, value, default_value)
        VALUES ('auth', 'invited_testers_message', 'Operator row', 'string', 'Invite only for now.', 'Invite only for now.')`);

    await database.query(readMigration(MIGRATION_188));
    const rows = async () => (await database.query(`SELECT category, subcategory, key, value_type, value, default_value, is_active
        FROM platform_settings WHERE key = ANY($1::text[]) ORDER BY key`, [KEYS])).rows;
    const afterFirst = await rows();
    expect(afterFirst).toEqual([
      { category: 'auth', subcategory: null, key: 'invited_testers_message', value_type: 'string',
        value: 'Invite only for now.', default_value: 'Invite only for now.', is_active: true },
      { category: 'auth', subcategory: 'sign_in', key: 'invited_testers_only', value_type: 'boolean',
        value: 'true', default_value: 'true', is_active: true },
      { category: 'marketing', subcategory: 'referral', key: 'referral_program_enabled', value_type: 'boolean',
        value: 'false', default_value: 'false', is_active: true },
      { category: 'loyalty', subcategory: 'suki', key: 'suki_program_enabled', value_type: 'boolean',
        value: 'false', default_value: 'false', is_active: true },
    ]);
    expect(KEYS.map((key) => [key, SETTING_DEFAULTS[key]])).toEqual([
      ['invited_testers_message', 'onService is open to invited testers for now.'],
      ['invited_testers_only', 'true'],
      ['referral_program_enabled', 'false'],
      ['suki_program_enabled', 'false'],
    ]);

    await database.query(readMigration(MIGRATION_188));
    expect(await rows()).toEqual(afterFirst);

    // With no operator row, 188 seeds the message itself.
    await database.query("DELETE FROM platform_settings WHERE key = 'invited_testers_message'");
    await database.query(readMigration(MIGRATION_188));
    expect((await rows())[0]).toEqual({ category: 'auth', subcategory: 'sign_in', key: 'invited_testers_message',
      value_type: 'string', value: 'onService is open to invited testers for now.',
      default_value: 'onService is open to invited testers for now.', is_active: true });
  }, { migration188: false });
}, 90000);

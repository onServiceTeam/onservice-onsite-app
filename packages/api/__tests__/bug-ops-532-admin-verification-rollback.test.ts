import {
  verificationIt as it, requestVerification, withVerificationDatabase,
} from './helpers/admin-verification-postgres';

it('Bug OPS-532 — a failed login metadata write rolls back recovery-code consumption and its audit for a retry', async () => {
  await withVerificationDatabase(async (database, _secret, codes) => {
    const codesBefore = (await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows;
    const accounts = (await database.query('SELECT * FROM users')).rows;
    const audits = (await database.query('SELECT * FROM admin_actions ORDER BY id')).rows;
    await database.query(`CREATE FUNCTION fail_verification_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'synthetic verification metadata failure'; END $$;
      CREATE TRIGGER fail_verification_metadata BEFORE UPDATE OF last_login_at ON users
        FOR EACH ROW EXECUTE FUNCTION fail_verification_metadata();`);
    const failed = await requestVerification({ backupCode: codes[0]! });
    expect(failed.status).toBe(500);
    expect(failed.headers['set-cookie']).toBeUndefined();
    expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
    expect((await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows).toEqual(codesBefore);
    expect((await database.query('SELECT * FROM admin_actions ORDER BY id')).rows).toEqual(audits);
    expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual([]);
    expect((await database.query('SELECT * FROM admin_csrf_tokens')).rows).toEqual([]);
    await database.query('DROP TRIGGER fail_verification_metadata ON users');
    const retry = await requestVerification({ backupCode: codes[0]! });
    expect(retry.status).toBe(200);
    expect(retry.body.data.backupCodesRemaining).toBe(7);
    expect((await database.query('SELECT count(*)::int AS count FROM admin_backup_codes WHERE used_at IS NOT NULL')).rows)
      .toEqual([{ count: 1 }]);
    expect((await database.query("SELECT count(*)::int AS count FROM admin_actions WHERE action_type='admin_backup_code_used'")).rows)
      .toEqual([{ count: 1 }]);
  });
}, 30000);

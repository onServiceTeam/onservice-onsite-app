import {
  enrollmentIt as it, enrollmentOwner, requestSetup, withEnrollmentDatabase,
  pauseEnrollmentAuthorization, within,
} from './helpers/admin-enrollment-postgres';

it('Bug OPS-527 — administrator setup refuses authority revoked after its initial authorization without changing enrollment', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    for (const type of ['pre_auth_2fa_setup', 'access']) {
      for (const mutation of ['inactive', 'role', 'generation', 'missing', 'rotation']) {
        if (type === 'pre_auth_2fa_setup' && mutation === 'rotation') continue;
        await withEnrollmentDatabase(async database => {
          const pause = pauseEnrollmentAuthorization();
          const pending = requestSetup(role, type).then(response => response);
          try {
            await within(pause.entered, 'initial setup authorization');
            if (mutation === 'inactive') await database.query('UPDATE users SET is_active=FALSE WHERE id=$1', [enrollmentOwner]);
            if (mutation === 'role') await database.query('UPDATE users SET role=$2 WHERE id=$1',
              [enrollmentOwner, role === 'super_admin' ? 'admin' : 'super_admin']);
            if (mutation === 'generation') await database.query('UPDATE users SET session_version=2 WHERE id=$1', [enrollmentOwner]);
            if (mutation === 'missing') await database.query('DELETE FROM users WHERE id=$1', [enrollmentOwner]);
            if (mutation === 'rotation') await database.query('UPDATE users SET must_rotate_password=TRUE WHERE id=$1', [enrollmentOwner]);
            const accounts = (await database.query('SELECT * FROM users')).rows;
            pause.release();
            const response = await within(pending, 'revoked setup response');
            expect(response.status).toBe(mutation === 'rotation' ? 428 : 401);
            expect(response.body.data).toBeUndefined();
            expect(response.headers['set-cookie']).toBeUndefined();
            expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
            expect((await database.query('SELECT * FROM admin_actions')).rows).toEqual([]);
            expect((await database.query('SELECT * FROM admin_backup_codes')).rows).toEqual([]);
          } finally {
            pause.release(); await pending; pause.restore();
          }
        }, role);
      }
    }
  }
}, 60000);

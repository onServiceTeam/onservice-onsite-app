import {
  enrollmentIt as it, enrollmentOwner, requestEnable, withEnrollmentDatabase,
  pauseEnrollmentAuthorization, within,
} from './helpers/admin-enrollment-postgres';
import { generateTotp } from '../src/utils/totp';

it('Bug OPS-529 — enrollment completion refuses revoked proof without activating a factor or upgrading credentials', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    for (const type of ['pre_auth_2fa_setup', 'access']) {
      for (const mutation of ['generation', 'role', 'inactive', 'missing', 'rotation']) {
        if (type === 'pre_auth_2fa_setup' && mutation === 'rotation') continue;
        await withEnrollmentDatabase(async (database, secret) => {
          const pause = pauseEnrollmentAuthorization();
          const pending = requestEnable(generateTotp(secret), role, type).then(response => response);
          try {
            await within(pause.entered, 'initial enable authorization');
            if (mutation === 'generation') await database.query('UPDATE users SET session_version=2 WHERE id=$1', [enrollmentOwner]);
            if (mutation === 'role') await database.query('UPDATE users SET role=$2 WHERE id=$1',
              [enrollmentOwner, role === 'super_admin' ? 'admin' : 'super_admin']);
            if (mutation === 'inactive') await database.query('UPDATE users SET is_active=FALSE WHERE id=$1', [enrollmentOwner]);
            if (mutation === 'missing') await database.query('DELETE FROM users WHERE id=$1', [enrollmentOwner]);
            if (mutation === 'rotation') await database.query('UPDATE users SET must_rotate_password=TRUE WHERE id=$1', [enrollmentOwner]);
            const accounts = (await database.query('SELECT * FROM users')).rows;
            pause.release();
            const response = await within(pending, 'revoked enable response');
            expect(response.status).toBe(mutation === 'rotation' ? 428 : 401);
            expect(response.body.data).toBeUndefined();
            expect(response.headers['set-cookie']).toBeUndefined();
            expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
            for (const table of ['admin_actions', 'admin_backup_codes', 'refresh_tokens', 'admin_csrf_tokens']) {
              expect((await database.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
            }
          } finally {
            pause.release(); await pending; pause.restore();
          }
        }, role);
      }
    }
  }
}, 60000);

import {
  enrollmentIt as it, requestEnable, requestSetup, withEnrollmentDatabase,
  pauseFirstEnrollmentTransaction, within,
} from './helpers/admin-enrollment-postgres';
import { generateTotp, verifyTotp } from '../src/utils/totp';

it('Bug OPS-530 — a delayed enable cannot activate a replacement pending key using the earlier key code', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    for (const type of ['pre_auth_2fa_setup', 'access']) {
      await withEnrollmentDatabase(async (database, oldSecret) => {
        const oldCode = generateTotp(oldSecret);
        const pause = pauseFirstEnrollmentTransaction();
        const pending = requestEnable(oldCode, role, type).then(response => response);
        try {
          await within(pause.entered, 'enable transaction boundary');
          // Real setup requests replace the pending key. In the unlikely event
          // of a six-digit collision, select another actual generated key.
          let replaced = false;
          for (let attempt = 0; attempt < 5 && !replaced; attempt++) {
            const setup = await requestSetup(role, type);
            expect(setup.status).toBe(200);
            replaced = !verifyTotp(setup.body.data.secret, oldCode, 2);
          }
          expect(replaced).toBe(true);
          const accounts = (await database.query('SELECT * FROM users')).rows;
          const audits = (await database.query('SELECT * FROM admin_actions ORDER BY id')).rows;
          pause.release();
          const response = await within(pending, 'stale factor response');
          expect(response.status).toBe(400);
          expect(response.body.data).toBeUndefined();
          expect(response.headers['set-cookie']).toBeUndefined();
          expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
          expect((await database.query('SELECT * FROM admin_actions ORDER BY id')).rows).toEqual(audits);
          for (const table of ['admin_backup_codes', 'refresh_tokens', 'admin_csrf_tokens']) {
            expect((await database.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
          }
        } finally {
          pause.release(); await pending; pause.restore();
        }
      }, role);
    }
  }
}, 60000);

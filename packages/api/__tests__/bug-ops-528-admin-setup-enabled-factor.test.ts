import {
  enrollmentApp, enrollmentToken, enrollmentIt as it, requestSetup,
  withEnrollmentDatabase, pauseFirstEnrollmentTransaction, within,
} from './helpers/admin-enrollment-postgres';
import request from 'supertest';
import { generateTotp } from '../src/utils/totp';

it('Bug OPS-528 — delayed setup cannot replace a factor completed by the real enable route', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    await withEnrollmentDatabase(async (database, totpSecret) => {
      const pause = pauseFirstEnrollmentTransaction();
      const pending = requestSetup(role).then(response => response);
      try {
        await within(pause.entered, 'setup transaction boundary');
        const enabled = await request(enrollmentApp).post('/auth/admin/2fa/enable')
          .set('Authorization', `Bearer ${enrollmentToken(role)}`)
          .send({ totpCode: generateTotp(totpSecret) });
        expect(enabled.status).toBe(200);
        expect(enabled.body.data.backupCodes).toHaveLength(8);
        const accounts = (await database.query('SELECT * FROM users')).rows;
        const audits = (await database.query('SELECT * FROM admin_actions ORDER BY id')).rows;
        const codes = (await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows;
        const sessions = (await database.query('SELECT * FROM refresh_tokens')).rows;
        const csrf = (await database.query('SELECT * FROM admin_csrf_tokens')).rows;
        pause.release();
        const response = await within(pending, 'delayed setup response');
        expect(response.status).toBe(409);
        expect(response.body.data).toBeUndefined();
        expect(response.headers['set-cookie']).toBeUndefined();
        expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
        expect((await database.query('SELECT * FROM admin_actions ORDER BY id')).rows).toEqual(audits);
        expect((await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows).toEqual(codes);
        expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(sessions);
        expect((await database.query('SELECT * FROM admin_csrf_tokens')).rows).toEqual(csrf);
      } finally {
        pause.release(); await pending; pause.restore();
      }
    }, role);
  }
}, 60000);

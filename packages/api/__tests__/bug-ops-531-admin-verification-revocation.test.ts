import { generateTotp } from '../src/utils/totp';
import type { Response } from 'supertest';
import {
  verificationIt as it, verificationOwner, requestVerification, withVerificationDatabase,
  waitForVerificationLock, within,
} from './helpers/admin-verification-postgres';

it('Bug OPS-531 — second-factor verification refuses committed revocation before consuming recovery codes or recording login', async () => {
  for (const role of ['admin', 'super_admin', 'dpo']) {
    for (const method of ['totp', 'backup']) {
      for (const mutation of ['generation', 'role', 'inactive']) {
        await withVerificationDatabase(async (database, secret, codes) => {
          const codesBefore = (await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows;
          const auditsBefore = (await database.query('SELECT * FROM admin_actions ORDER BY id')).rows;
          const blocker = await database.connect();
          let pending: Promise<Response> | undefined;
          try {
            await blocker.query('BEGIN');
            const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
            if (mutation === 'generation') await blocker.query('UPDATE users SET session_version=2 WHERE id=$1', [verificationOwner]);
            if (mutation === 'role') await blocker.query('UPDATE users SET role=$2 WHERE id=$1',
              [verificationOwner, role === 'super_admin' ? 'admin' : 'super_admin']);
            if (mutation === 'inactive') await blocker.query('UPDATE users SET is_active=FALSE WHERE id=$1', [verificationOwner]);
            const accounts = (await blocker.query('SELECT * FROM users')).rows;
            pending = requestVerification(method === 'totp'
              ? { totpCode: generateTotp(secret) } : { backupCode: codes[0]! }, role).then(response => response);
            await waitForVerificationLock(database, pid);
            await blocker.query('COMMIT');
            const response = await within(pending, 'revoked second-factor response');
            expect(response).toMatchObject({ status: 401 });
            expect(response.headers['set-cookie']).toBeUndefined();
            expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
            expect((await database.query('SELECT * FROM admin_backup_codes ORDER BY id')).rows).toEqual(codesBefore);
            expect((await database.query('SELECT * FROM admin_actions ORDER BY id')).rows).toEqual(auditsBefore);
            expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual([]);
            expect((await database.query('SELECT * FROM admin_csrf_tokens')).rows).toEqual([]);
          } finally {
            await blocker.query('ROLLBACK'); blocker.release();
            if (pending) await pending;
          }
        }, role);
      }
    }
  }
}, 60000);

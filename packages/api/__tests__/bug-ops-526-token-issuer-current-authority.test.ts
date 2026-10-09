import { createTokenPair } from '../src/services/auth.service';
import { sessionIntegrationIt as it, sessionOwner, withSessionDatabase } from './helpers/account-session-postgres';

it('Bug OPS-526 — credential issuance refuses missing, inactive, role-changed or generation-revoked accounts without persisting a session', async () => {
  for (const role of ['customer', 'provider', 'provider_staff', 'admin', 'super_admin', 'dpo']) {
    for (const mutation of ['inactive', 'role', 'generation', 'missing']) {
      await withSessionDatabase(async database => {
        if (mutation === 'missing') {
          await database.query('DELETE FROM refresh_tokens');
          await database.query('DELETE FROM users WHERE id=$1', [sessionOwner]);
        } else if (mutation === 'inactive') {
          await database.query('UPDATE users SET is_active=FALSE WHERE id=$1', [sessionOwner]);
        } else if (mutation === 'role') {
          await database.query('UPDATE users SET role=$2 WHERE id=$1',
            [sessionOwner, role === 'admin' ? 'customer' : 'admin']);
        } else {
          await database.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
        }
        const accounts = (await database.query('SELECT * FROM users')).rows;
        const sessions = (await database.query('SELECT * FROM refresh_tokens')).rows;
        // Never serialize returned credentials in a failing baseline assertion.
        const result = await createTokenPair(sessionOwner, role, 1).then(() => ({ outcome: 'issued' }),
          (error: { statusCode?: number }) => ({ outcome: 'denied', statusCode: error.statusCode }));
        expect(result).toEqual({ outcome: 'denied', statusCode: 401 });
        expect((await database.query('SELECT * FROM users')).rows).toEqual(accounts);
        expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual(sessions);
      }, role);
    }
  }
}, 60000);

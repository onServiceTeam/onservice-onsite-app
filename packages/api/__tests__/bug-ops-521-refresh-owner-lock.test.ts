import { refreshAccessToken } from '../src/services/auth.service';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { sessionIntegrationIt as it, sessionOwner, sessionHash, withSessionDatabase } from './helpers/account-session-postgres';

it('Bug OPS-521 — rotation waits for account changes without retaining the old token lock and rejects the committed revocation', async () => {
  for (const role of ['customer', 'provider', 'provider_staff', 'admin', 'super_admin', 'dpo']) {
    await withSessionDatabase(async (database, token) => {
      const blocker = await database.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [sessionOwner]);
        pending = refreshAccessToken(token).then(result => result, error => error);
        await waitForBlockedApproval(database, pid);
        // Real owner-first revocation fixture. NOWAIT detects the old inverted
        // token -> owner/FK order without waiting for a database deadlock timer.
        await blocker.query('SELECT id FROM refresh_tokens WHERE user_id=$1 FOR UPDATE NOWAIT', [sessionOwner]);
        await blocker.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
        await blocker.query('COMMIT');
        expect(await pending).toMatchObject({ statusCode: 401 });
        expect((await database.query('SELECT token_hash FROM refresh_tokens')).rows).toEqual([{ token_hash: sessionHash(token) }]);
        expect((await database.query('SELECT session_version FROM users')).rows).toEqual([{ session_version: 2 }]);
      } finally {
        await blocker.query('ROLLBACK'); blocker.release();
        if (pending) await pending;
      }
    }, role);
  }
}, 30000);

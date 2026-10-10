import { processExpiredCoolingOff } from '../src/services/data-management.service';
import { waitForBlockedApproval } from './helpers/provider-approval-postgres';
import { sessionIntegrationIt as it, sessionOwner, seedDeletion, withSessionDatabase } from './helpers/account-session-postgres';

it('Bug OPS-522 — partial anonymization waits for its account before tokens and preserves completed booking amounts', async () => {
  await withSessionDatabase(async database => {
    await seedDeletion(database);
    const provider = (await database.query('INSERT INTO providers (user_id) VALUES ($1) RETURNING id', [sessionOwner])).rows[0].id;
    await database.query('INSERT INTO provider_services (provider_id) VALUES ($1)', [provider]);
    const blocker = await database.connect();
    let pending: Promise<number> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [sessionOwner]);
      pending = processExpiredCoolingOff();
      await waitForBlockedApproval(database, pid);
      await blocker.query('SELECT id FROM refresh_tokens WHERE user_id=$1 FOR UPDATE NOWAIT', [sessionOwner]);
      await blocker.query('UPDATE users SET session_version=2 WHERE id=$1', [sessionOwner]);
      await blocker.query('DELETE FROM refresh_tokens WHERE user_id=$1', [sessionOwner]);
      await blocker.query('COMMIT');
      expect(await pending).toBe(1);
      expect((await database.query('SELECT is_active,first_name,last_name,session_version FROM users')).rows)
        .toEqual([{ is_active: false, first_name: 'Deleted', last_name: 'User', session_version: 2 }]);
      for (const table of ['refresh_tokens', 'user_addresses', 'push_tokens']) {
        expect((await database.query(`SELECT count(*)::int AS count FROM ${table}`)).rows).toEqual([{ count: 0 }]);
      }
      expect((await database.query('SELECT comment FROM reviews')).rows).toEqual([{ comment: '' }]);
      expect((await database.query('SELECT content FROM messages')).rows).toEqual([{ content: '[deleted]' }]);
      expect((await database.query('SELECT status,business_name,nbi_clearance_url FROM providers')).rows)
        .toEqual([{ status: 'deactivated', business_name: 'Deleted Provider', nbi_clearance_url: null }]);
      expect((await database.query('SELECT is_active FROM provider_services')).rows).toEqual([{ is_active: false }]);
      expect((await database.query('SELECT status,total_amount FROM bookings')).rows).toEqual([{ status: 'paid_out', total_amount: '12345' }]);
      expect((await database.query('SELECT status,processed_at IS NOT NULL AS processed FROM account_deletion_requests')).rows)
        .toEqual([{ status: 'completed', processed: true }]);
    } finally {
      await blocker.query('ROLLBACK'); blocker.release();
      if (pending) await pending;
    }
  }, 'provider');
}, 15000);

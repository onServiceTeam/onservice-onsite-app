import { approveProvider, reactivateProvider, suspendProvider } from '../src/services/admin.service';
import { approvalIntegrationIt as it, approvalReview, waitForBlockedApproval, withApprovalDatabase } from './helpers/provider-approval-postgres';

it('Bug OPS-520 — suspension and reactivation use owner-first locking without changing admission, credentials or historical money', async () => {
  for (const action of ['suspend', 'reactivate'] as const) {
    await withApprovalDatabase(async database => {
      await database.query(`
        ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 1;
        CREATE TABLE refresh_tokens (user_id text REFERENCES users(id));
        CREATE TABLE bookings (
          id text PRIMARY KEY, provider_id text REFERENCES providers(id), status text,
          provider_suspended_during_booking_at timestamptz, updated_at timestamptz DEFAULT NOW(),
          total_amount integer NOT NULL, escrow_status text NOT NULL
        );
      `);
      await approveProvider('application', 'operator', approvalReview);
      await database.query(`
        INSERT INTO refresh_tokens (user_id) VALUES ('owner');
        INSERT INTO bookings (id,provider_id,status,total_amount,escrow_status) VALUES
          ('active','application','in_progress',12000,'held'),
          ('historical','application','paid_out',9000,'released');
      `);
      const reason = 'Support evidence reviewed for the recorded provider account.';
      if (action === 'reactivate') await suspendProvider('application', 'operator', reason);
      const beforeBookings = (await database.query('SELECT * FROM bookings ORDER BY id')).rows;
      const blocker = await database.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await blocker.query("SELECT id FROM users WHERE id='owner' FOR UPDATE");
        pending = (action === 'suspend'
          ? suspendProvider('application', 'operator', reason)
          : reactivateProvider('application', 'operator', reason)
        ).then(() => 'completed', error => error);
        await waitForBlockedApproval(database, pid);
        await blocker.query("SELECT id FROM providers WHERE id='application' FOR UPDATE NOWAIT");
        await blocker.query('COMMIT');
        expect(await pending).toBe('completed');
        expect((await database.query('SELECT status FROM providers')).rows)
          .toEqual([{ status: action === 'suspend' ? 'suspended' : 'approved' }]);
        expect((await database.query("SELECT role,session_version FROM users WHERE id='owner'")).rows)
          .toEqual([{ role: 'provider', session_version: 2 }]);
        expect((await database.query('SELECT * FROM refresh_tokens')).rows).toEqual([]);
        const bookings = (await database.query('SELECT * FROM bookings ORDER BY id')).rows;
        expect(bookings[0]).toMatchObject({ id: 'active', total_amount: 12000, escrow_status: 'held',
          provider_suspended_during_booking_at: expect.any(Date) });
        expect(bookings[1]).toEqual(beforeBookings[1]);
        if (action === 'reactivate') expect(bookings).toEqual(beforeBookings);
        const type = action === 'suspend' ? 'provider_suspended' : 'provider_reactivated';
        expect((await database.query('SELECT reason FROM admin_actions WHERE action_type=$1', [type])).rows)
          .toEqual([{ reason }]);
        expect((await database.query('SELECT user_id FROM notifications WHERE type=$1', [type])).rows)
          .toEqual([{ user_id: 'owner' }]);
        expect((await database.query('SELECT decision FROM provider_application_decisions')).rows)
          .toEqual([{ decision: 'approved' }]);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        if (pending) await pending;
      }
    });
  }
}, 30000);

import { approveProvider, reactivateProvider, suspendProvider } from '../src/services/admin.service';
import { approvalIntegrationIt as it, approvalReview, assertNoApproval, waitForBlockedApproval, withApprovalDatabase } from './helpers/provider-approval-postgres';

it('Bug OPS-481 — suspension and reactivation cannot substitute for provider admission or override account and booking holds', async () => {
  await withApprovalDatabase(async (database) => {
    await database.query(`
      ALTER TABLE users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
      CREATE TABLE refresh_tokens (user_id text REFERENCES users(id));
      CREATE TABLE bookings (
        id text PRIMARY KEY, provider_id text REFERENCES providers(id), status text,
        provider_suspended_during_booking_at timestamptz, updated_at timestamptz DEFAULT NOW(),
        total_amount integer NOT NULL, escrow_status text NOT NULL
      );
    `);
    const reason = 'Suspension concern reviewed against the retained support evidence.';
    // The old API admitted pending -> suspended -> approved with no KYC review.
    await expect(suspendProvider('application', 'operator', reason)).rejects.toMatchObject({ statusCode: 404 });
    await assertNoApproval(database);
    expect((await database.query("SELECT role,session_version FROM users WHERE id='owner'")).rows)
      .toEqual([{ role: 'customer', session_version: 0 }]);

    // An already-suspended legacy applicant cannot evade the forward guard.
    await database.query("UPDATE providers SET status='suspended' WHERE id='application'");
    const legacy = (await database.query('SELECT * FROM providers')).rows;
    await expect(reactivateProvider('application', 'operator', reason)).rejects.toMatchObject({ statusCode: 409 });
    expect((await database.query('SELECT * FROM providers')).rows).toEqual(legacy);
    await database.query("UPDATE providers SET reviewed_at=NOW() WHERE id='application'");
    await database.query("UPDATE users SET role='provider' WHERE id='owner'");
    await database.query("INSERT INTO admin_actions(admin_id,action_type,target_type,target_id) VALUES('operator','provider_rejected','provider','application')");
    await expect(reactivateProvider('application', 'operator', reason)).rejects.toMatchObject({ statusCode: 409 });
    await database.query(`INSERT INTO admin_actions(admin_id,action_type,target_type,target_id) VALUES
      ('operator','provider_approved','customer','application'),
      ('operator','provider_approved','provider','different-provider')`);
    await expect(reactivateProvider('application', 'operator', reason)).rejects.toMatchObject({ statusCode: 409 });
    await database.query("UPDATE providers SET reviewed_at=NULL WHERE id='application'");
    await database.query("INSERT INTO admin_actions(admin_id,action_type,target_type,target_id) VALUES('operator','provider_approved','provider','application')");
    await expect(reactivateProvider('application', 'operator', reason)).rejects.toMatchObject({ statusCode: 409 });
    expect((await database.query('SELECT count(*)::int AS count FROM notifications')).rows).toEqual([{ count: 0 }]);
    await database.query('DELETE FROM admin_actions');

    // Establish the actual canonical admission, then suspend a former provider.
    await database.query("UPDATE providers SET status='pending',reviewed_at=NULL WHERE id='application'");
    await approveProvider('application', 'operator', approvalReview);
    await database.query(`
      INSERT INTO refresh_tokens(user_id) VALUES('owner');
      INSERT INTO bookings(id,provider_id,status,total_amount,escrow_status) VALUES
      ('active','application','in_progress',12000,'held'),
      ('historical','application','paid_out',9000,'released');
    `);
    await suspendProvider('application', 'operator', reason);
    const bookingState = (await database.query('SELECT * FROM bookings ORDER BY id')).rows;
    expect(bookingState[0]).toMatchObject({ id: 'active', total_amount: 12000, escrow_status: 'held', provider_suspended_during_booking_at: expect.any(Date) });
    expect(bookingState[1]).toMatchObject({ id: 'historical', total_amount: 9000, escrow_status: 'released', provider_suspended_during_booking_at: null });
    expect((await database.query('SELECT count(*)::int AS count FROM refresh_tokens')).rows).toEqual([{ count: 0 }]);
    const suspendedState = (await database.query('SELECT * FROM providers')).rows;
    const counts = async () => (await database.query(`SELECT
      (SELECT count(*)::int FROM admin_actions) AS actions,
      (SELECT count(*)::int FROM notifications) AS notices`)).rows;
    const beforeCounts = await counts();

    for (const role of ['customer', 'provider_staff', 'admin', 'super_admin', 'dpo', 'unknown_future_role']) {
      await database.query("UPDATE users SET role=$1 WHERE id='owner'", [role]);
      await expect(reactivateProvider('application', 'operator', reason)).rejects.toMatchObject({ statusCode: 409 });
      expect((await database.query('SELECT * FROM providers')).rows).toEqual(suspendedState);
      expect(await counts()).toEqual(beforeCounts);
      expect((await database.query("SELECT role FROM users WHERE id='owner'")).rows).toEqual([{ role }]);
    }
    for (const [active, fraud] of [[false, false], [true, true]]) {
      await database.query("UPDATE users SET role='provider',is_active=$1,is_flagged_fraud=$2 WHERE id='owner'", [active, fraud]);
      await expect(reactivateProvider('application', 'operator', reason)).rejects.toMatchObject({ statusCode: 409 });
      expect(await counts()).toEqual(beforeCounts);
    }
    await database.query("UPDATE users SET role='provider',is_active=TRUE,is_flagged_fraud=FALSE WHERE id='owner'");

    const blocker = await database.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      const { rows } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      await blocker.query("UPDATE users SET is_flagged_fraud=TRUE WHERE id='owner'");
      pending = reactivateProvider('application', 'operator', reason).then(() => 'reactivated', error => error);
      await waitForBlockedApproval(database, rows[0]!.pid);
      await blocker.query('COMMIT');
      expect(await pending).toMatchObject({ statusCode: 409 });
      expect((await database.query('SELECT * FROM providers')).rows).toEqual(suspendedState);
      expect(await counts()).toEqual(beforeCounts);
    } finally {
      await blocker.query('ROLLBACK');
      if (pending) await pending;
      blocker.release();
    }
    await database.query("UPDATE users SET is_flagged_fraud=FALSE WHERE id='owner'");
    await expect(reactivateProvider('application', 'missing-operator', reason)).rejects.toMatchObject({ code: '23503' });
    expect((await database.query('SELECT * FROM providers')).rows).toEqual(suspendedState);
    expect(await counts()).toEqual(beforeCounts);

    const decisions = await Promise.allSettled([
      reactivateProvider('application', 'operator', reason),
      reactivateProvider('application', 'operator', reason),
    ]);
    expect(decisions.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await database.query('SELECT status FROM providers')).rows).toEqual([{ status: 'approved' }]);
    expect((await database.query("SELECT role,session_version FROM users WHERE id='owner'")).rows)
      .toEqual([{ role: 'provider', session_version: 1 }]);
    expect((await database.query('SELECT * FROM bookings ORDER BY id')).rows).toEqual(bookingState);
    expect((await database.query("SELECT action_type,reason,full_notes FROM admin_actions WHERE action_type='provider_reactivated'")).rows)
      .toEqual([{ action_type: 'provider_reactivated', reason, full_notes: reason }]);
    expect((await database.query("SELECT user_id,data FROM notifications WHERE type='provider_reactivated'")).rows)
      .toEqual([{ user_id: 'owner', data: { providerId: 'application', reason } }]);
  });
}, 30000);

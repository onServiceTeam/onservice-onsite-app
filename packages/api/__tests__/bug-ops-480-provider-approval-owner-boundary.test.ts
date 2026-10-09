import { approveProvider } from '../src/services/admin.service';
import { approvalIntegrationIt as it, approvalReview, assertNoApproval, waitForBlockedApproval, withApprovalDatabase } from './helpers/provider-approval-postgres';

it('Bug OPS-480 — provider approval cannot overwrite privileged or staff roles or activate an inactive or fraud-flagged owner', async () => {
  await withApprovalDatabase(async (database) => {
    for (const role of ['admin', 'super_admin', 'dpo', 'provider_staff', 'unknown_future_role']) {
      await database.query("UPDATE users SET role=$1 WHERE id='owner'", [role]);
      const before = (await database.query("SELECT * FROM users WHERE id='owner'")).rows;
      await expect(approveProvider('application', 'operator', approvalReview)).rejects.toMatchObject({ statusCode: 409 });
      await assertNoApproval(database);
      expect((await database.query("SELECT * FROM users WHERE id='owner'")).rows).toEqual(before);
    }
    for (const [active, flagged] of [[false, false], [true, true], [false, true]]) {
      await database.query("UPDATE users SET role='customer',is_active=$1,is_flagged_fraud=$2 WHERE id='owner'", [active, flagged]);
      await expect(approveProvider('application', 'operator', approvalReview)).rejects.toMatchObject({ statusCode: 409 });
      await assertNoApproval(database);
      expect((await database.query("SELECT role,is_active,is_flagged_fraud FROM users WHERE id='owner'")).rows)
        .toEqual([{ role: 'customer', is_active: active, is_flagged_fraud: flagged }]);
    }
    await database.query("UPDATE users SET role='customer',is_active=TRUE,is_flagged_fraud=FALSE WHERE id='owner'");

    const blocker = await database.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      const { rows } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      await blocker.query("UPDATE users SET role='admin' WHERE id='owner'");
      pending = approveProvider('application', 'operator', approvalReview).then(() => 'approved', error => error);
      await waitForBlockedApproval(database, rows[0]!.pid);
      await blocker.query('COMMIT');
      expect(await pending).toMatchObject({ statusCode: 409 });
      await assertNoApproval(database);
      expect((await database.query("SELECT role FROM users WHERE id='owner'")).rows).toEqual([{ role: 'admin' }]);
    } finally {
      await blocker.query('ROLLBACK');
      if (pending) await pending;
      blocker.release();
    }

    // A downstream audit failure must roll back BOTH the provider decision
    // and role promotion; the real db.transaction performs this rollback.
    await database.query("UPDATE users SET role='customer' WHERE id='owner'");
    await expect(approveProvider('application', 'missing-operator', approvalReview)).rejects.toMatchObject({ code: '23503' });
    await assertNoApproval(database);
    expect((await database.query("SELECT role FROM users WHERE id='owner'")).rows).toEqual([{ role: 'customer' }]);

    // Support legacy applicants prematurely promoted by an old release,
    // but only while their canonical provider application is still pending.
    await database.query("UPDATE users SET role='provider' WHERE id='owner'");
    await expect(approveProvider('application', 'operator', approvalReview)).resolves.toBeUndefined();
    expect((await database.query('SELECT status FROM providers')).rows).toEqual([{ status: 'approved' }]);
    expect((await database.query('SELECT count(*)::int AS count FROM admin_actions')).rows).toEqual([{ count: 1 }]);
    expect((await database.query('SELECT count(*)::int AS count FROM notifications')).rows).toEqual([{ count: 1 }]);
  });
}, 30000);

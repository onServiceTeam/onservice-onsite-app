import { approveProvider } from '../src/services/admin.service';
import { approvalIntegrationIt as it, approvalReview, withApprovalDatabase } from './helpers/provider-approval-postgres';

it('Bug OPS-495 — a new approval notice explains fresh sign-in and setup without rewriting existing notifications or repeating the decision', async () => {
  await withApprovalDatabase(async database => {
    await database.query(`INSERT INTO notifications (user_id,type,title,body,data)
      VALUES ('owner','provider_approved','Historical approval','Existing notice must remain unchanged.', '{"historical":true}')`);
    const historical = (await database.query('SELECT * FROM notifications')).rows[0];
    await approveProvider('application', 'operator', approvalReview);
    const rows = (await database.query('SELECT * FROM notifications ORDER BY id')).rows;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(historical);
    expect(rows[1]).toMatchObject({
      user_id: 'owner', type: 'provider_approved', title: 'Account Approved',
      body: 'Your provider account has been approved. Sign in again with your verified mobile number, then review your services, pricing and availability in your provider workspace before accepting work.',
      data: { providerId: 'application' },
    });
    expect(rows[1].body).not.toContain('You can now start accepting jobs');
    expect((await database.query("SELECT status FROM providers WHERE id='application'")).rows).toEqual([{ status: 'approved' }]);
    expect((await database.query("SELECT role FROM users WHERE id='owner'")).rows).toEqual([{ role: 'provider' }]);
    await expect(approveProvider('application', 'operator', approvalReview)).rejects.toMatchObject({ statusCode: 404 });
    expect((await database.query('SELECT * FROM notifications ORDER BY id')).rows).toEqual(rows);
    expect((await database.query('SELECT count(*)::int AS count FROM admin_actions')).rows).toEqual([{ count: 1 }]);
  });
}, 30000);

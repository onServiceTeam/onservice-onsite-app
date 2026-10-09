import { approveProvider } from '../src/services/admin.service';
import { approvalIntegrationIt as it, approvalReview, assertNoApproval, waitForBlockedApproval, withApprovalDatabase } from './helpers/provider-approval-postgres';

it('Bug OPS-479 — provider approval requires all four current documents under the decision lock and preserves historical approvals', async () => {
  await withApprovalDatabase(async (database) => {
    const fields = { nbi_clearance_url: 'nbi', government_id_front_url: 'front', government_id_back_url: 'back', selfie_url: 'selfie' };
    for (const [field, originalKey] of Object.entries(fields)) {
      for (const missing of [null, '  ']) {
        await database.query(`UPDATE providers SET ${field}=$1 WHERE id='application'`, [missing]);
        await expect(approveProvider('application', 'operator', approvalReview))
          .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining(field) });
        await assertNoApproval(database);
      }
      await database.query(`UPDATE providers SET ${field}=$1 WHERE id='application'`, [`onboarding/owner/${originalKey}`]);
    }

    // Reproduce the real race: another transaction removes evidence while
    // the committed row still contains it. The old unlocked read approves it.
    const blocker = await database.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      const { rows } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      await blocker.query("UPDATE providers SET nbi_clearance_url=NULL WHERE id='application'");
      pending = approveProvider('application', 'operator', approvalReview).then(() => 'approved', error => error);
      await waitForBlockedApproval(database, rows[0]!.pid);
      await blocker.query('COMMIT');
      expect(await pending).toMatchObject({ statusCode: 400, message: expect.stringContaining('nbi_clearance_url') });
      await assertNoApproval(database);
    } finally {
      await blocker.query('ROLLBACK');
      if (pending) await pending;
      blocker.release();
    }
    await database.query("UPDATE providers SET nbi_clearance_url='onboarding/owner/nbi' WHERE id='application'");

    // A historical approved record with absent evidence is not silently
    // approved again, demoted, or retroactively given an invented decision.
    await database.query("UPDATE providers SET status='approved', government_id_back_url=NULL WHERE id='application'");
    const historical = (await database.query('SELECT * FROM providers')).rows;
    await expect(approveProvider('application', 'operator', approvalReview)).rejects.toMatchObject({ statusCode: 404 });
    expect((await database.query('SELECT * FROM providers')).rows).toEqual(historical);
    await database.query("UPDATE providers SET status='pending', government_id_back_url='onboarding/owner/back' WHERE id='application'");

    const decisions = await Promise.allSettled([
      approveProvider('application', 'operator', approvalReview),
      approveProvider('application', 'operator', approvalReview),
    ]);
    expect(decisions.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(decisions.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await database.query('SELECT status, reviewed_at IS NOT NULL AS reviewed FROM providers')).rows)
      .toEqual([{ status: 'approved', reviewed: true }]);
    expect((await database.query("SELECT role FROM users WHERE id='owner'")).rows).toEqual([{ role: 'provider' }]);
    expect((await database.query('SELECT action_type, reason, full_notes FROM admin_actions')).rows)
      .toEqual([{ action_type: 'provider_approved', reason: approvalReview.reason,
        full_notes: `Approval rationale: ${approvalReview.reason}\n\n${approvalReview.checklistSummary}` }]);
    expect((await database.query('SELECT user_id,type,data FROM notifications')).rows)
      .toEqual([{ user_id: 'owner', type: 'provider_approved', data: { providerId: 'application', revisionId: approvalReview.expectedRevisionId } }]);
  });
}, 30000);

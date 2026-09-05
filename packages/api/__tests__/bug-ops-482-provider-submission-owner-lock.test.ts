import { createProviderApplication } from '../src/services/provider.service';
import { approvalIntegrationIt as it, waitForBlockedApproval as waitForBlockedTransaction } from './helpers/provider-approval-postgres';
import { applicantId, applicationAreaId, applicationCategoryId, assertNoSubmission, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

it('Bug OPS-482 — application submission serializes duplicate requests and rechecks the current owner without granting or repairing access', async () => {
  await withSubmissionDatabase(async database => {
    for (const role of ['provider', 'admin', 'super_admin', 'dpo', 'provider_staff', 'future_role']) {
      await database.query('UPDATE users SET role=$1 WHERE id=$2', [role, applicantId]);
      const before = (await database.query('SELECT * FROM users')).rows;
      await expect(createProviderApplication(applicantId, submissionInput)).rejects.toMatchObject({ statusCode: 403 });
      await assertNoSubmission(database);
      expect((await database.query('SELECT * FROM users')).rows).toEqual(before);
    }
    for (const [active, flagged] of [[false, false], [true, true], [false, true]]) {
      await database.query("UPDATE users SET role='customer',is_active=$1,is_flagged_fraud=$2", [active, flagged]);
      await expect(createProviderApplication(applicantId, submissionInput)).rejects.toMatchObject({ statusCode: 403 });
      await assertNoSubmission(database);
    }
    await database.query("UPDATE users SET role='customer',is_active=TRUE,is_flagged_fraud=FALSE");

    // The committed snapshot is still eligible. Submission must wait for the
    // real concurrent restriction, then reject the newly committed state.
    for (const restriction of ["role='admin'", 'is_flagged_fraud=TRUE', 'is_active=FALSE']) {
      const blocker = await database.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
        await blocker.query(`UPDATE users SET ${restriction} WHERE id=$1`, [applicantId]);
        pending = createProviderApplication(applicantId, submissionInput).then(() => 'submitted', error => error);
        await waitForBlockedTransaction(database, pid);
        await blocker.query('COMMIT');
        expect(await pending).toMatchObject({ statusCode: 403 });
        await assertNoSubmission(database);
      } finally {
        await blocker.query('ROLLBACK');
        if (pending) await pending;
        blocker.release();
      }
      await database.query("UPDATE users SET role='customer',is_active=TRUE,is_flagged_fraud=FALSE");
    }

    await database.query('DELETE FROM users');
    await expect(createProviderApplication(applicantId, submissionInput)).rejects.toMatchObject({ statusCode: 403 });
    await assertNoSubmission(database);
    await database.query("INSERT INTO users (id,role) VALUES ($1,'customer')", [applicantId]);
    const ownerBefore = (await database.query('SELECT * FROM users')).rows;

    const results = await Promise.allSettled([
      createProviderApplication(applicantId, submissionInput),
      createProviderApplication(applicantId, submissionInput),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter(result => result.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({ reason: { statusCode: 409, message: expect.stringContaining('already exists') } });
    const records = (await database.query('SELECT * FROM providers')).rows;
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ user_id: applicantId, status: 'pending', city: 'Cebu City', province: 'Cebu',
      government_id_front_url: `onboarding/${applicantId}/front.jpg`, government_id_back_url: `onboarding/${applicantId}/back.jpg`,
      nbi_clearance_url: `onboarding/${applicantId}/nbi.jpg`, selfie_url: `onboarding/${applicantId}/selfie.jpg`,
      government_id_number: submissionInput.governmentIdNumber, years_experience: 5, vetting_answers: submissionInput.vettingAnswers,
      ic_agreement_accepted_at: expect.any(Date), applied_at: expect.any(Date), reviewed_at: null,
    });
    expect((await database.query('SELECT nbi_expiry_date::text AS expiry FROM providers')).rows).toEqual([{ expiry: '2028-02-29' }]);
    expect((await database.query('SELECT * FROM users')).rows).toEqual(ownerBefore);
    expect((await database.query('SELECT * FROM provider_service_areas')).rows)
      .toEqual([{ provider_id: records[0]!.id, service_area_id: applicationAreaId, is_primary: true }]);
    expect((await database.query('SELECT category_id,is_active FROM provider_services')).rows)
      .toEqual([{ category_id: applicationCategoryId, is_active: true }]);
    await expect(createProviderApplication(applicantId, submissionInput)).rejects.toMatchObject({ statusCode: 409 });
    expect((await database.query('SELECT * FROM providers')).rows).toEqual(records);
  });
}, 30000);

import { createProviderApplication } from '../src/services/provider.service';
import { approvalIntegrationIt as it, waitForBlockedApproval as waitForBlockedTransaction } from './helpers/provider-approval-postgres';
import { applicantId, applicationCategoryId, assertNoSubmission, submissionInput, withSubmissionDatabase } from './helpers/provider-submission-postgres';

it('Bug OPS-484 — applications require current active catalog categories and duplicate selections create only one linkage', async () => {
  await withSubmissionDatabase(async database => {
    for (const ids of [[], ['dddddddd-dddd-4ddd-8ddd-dddddddddddd'], [applicationCategoryId, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd']]) {
      await expect(createProviderApplication(applicantId, { ...submissionInput, categoryIds: ids }))
        .rejects.toMatchObject({ statusCode: 400 });
      await assertNoSubmission(database);
    }
    await database.query('UPDATE service_categories SET is_active=FALSE');
    await expect(createProviderApplication(applicantId, submissionInput)).rejects.toMatchObject({ statusCode: 400 });
    await assertNoSubmission(database);
    await database.query('UPDATE service_categories SET is_active=TRUE');

    const blocker = await database.connect();
    let pending: Promise<unknown> | undefined;
    try {
      await blocker.query('BEGIN');
      const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      await blocker.query('UPDATE service_categories SET is_active=FALSE WHERE id=$1', [applicationCategoryId]);
      pending = createProviderApplication(applicantId, submissionInput).then(() => 'submitted', error => error);
      await waitForBlockedTransaction(database, pid);
      await blocker.query('COMMIT');
      expect(await pending).toMatchObject({ statusCode: 400 });
      await assertNoSubmission(database);
    } finally {
      await blocker.query('ROLLBACK');
      if (pending) await pending;
      blocker.release();
    }
    await database.query('UPDATE service_categories SET is_active=TRUE');
    await createProviderApplication(applicantId, { ...submissionInput, categoryIds: [applicationCategoryId, applicationCategoryId] });
    expect((await database.query('SELECT category_id,is_active FROM provider_services')).rows)
      .toEqual([{ category_id: applicationCategoryId, is_active: true }]);
    // Existing applications are not retroactively rewritten by catalog edits.
    const before = (await database.query('SELECT * FROM providers')).rows;
    await database.query('UPDATE service_categories SET is_active=FALSE');
    expect((await database.query('SELECT * FROM providers')).rows).toEqual(before);
  });
}, 30000);

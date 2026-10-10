import { getApplicationDraft, saveApplicationDraft, deleteApplicationDraft } from '../src/services/provider-application-draft.service';
import { draftIntegrationIt as it, withDraftDatabase, draftOwner, otherDraftOwner } from './helpers/provider-draft-postgres';
import { waitForBlockedApproval as waitForBlockedTransaction } from './helpers/provider-approval-postgres';

it('Bug OPS-486 — draft storage stays owner-only and follows locked current account and canonical application state', async () => {
  await withDraftDatabase(async database => {
    expect(await getApplicationDraft(draftOwner)).toBeNull();
    const first = await saveApplicationDraft(draftOwner, { expectedRevision: null, fields: {
      businessName: 'Private draft', governmentIdNumber: 'FIXTURE-ONLY',
      governmentIdFrontUrl: `https://uploads.example/onboarding/${draftOwner}/front.jpg?discard=token`,
      vettingAnswers: { references: [{ name: 'Unfinished reference' }] },
    } });
    expect(await getApplicationDraft(draftOwner)).toEqual(first);
    expect(first.fields.governmentIdFrontUrl).toBe(`onboarding/${draftOwner}/front.jpg`);
    expect(first.fields.vettingAnswers.references).toEqual([{ name: 'Unfinished reference', contact: '', relation: '' }]);
    expect(Date.parse(first.expiresAt) - Date.parse(first.savedAt)).toBe(30 * 86400000);
    expect(await getApplicationDraft(otherDraftOwner)).toBeNull();
    await deleteApplicationDraft(otherDraftOwner, { expectedRevision: first.revision });
    expect(await getApplicationDraft(draftOwner)).toEqual(first);
    const ownerBefore = (await database.query('SELECT * FROM users ORDER BY id')).rows;
    const draftBefore = (await database.query('SELECT * FROM provider_application_drafts')).rows;

    for (const role of ['provider', 'provider_staff', 'admin', 'super_admin', 'dpo', 'future_role']) {
      await database.query('UPDATE users SET role=$1 WHERE id=$2', [role, draftOwner]);
      for (const request of [() => getApplicationDraft(draftOwner),
        () => saveApplicationDraft(draftOwner, { expectedRevision: first.revision, fields: {} }),
        () => deleteApplicationDraft(draftOwner, { expectedRevision: first.revision })]) {
        await expect(request()).rejects.toMatchObject({ statusCode: 403 });
      }
      expect((await database.query('SELECT * FROM provider_application_drafts')).rows).toEqual(draftBefore);
    }
    await database.query("UPDATE users SET role='customer' WHERE id=$1", [draftOwner]);
    for (const restriction of ['is_active=FALSE', 'is_flagged_fraud=TRUE']) {
      const blocker = await database.connect();
      let pending: Promise<unknown> | undefined;
      try {
        await blocker.query('BEGIN');
        const pid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
        await blocker.query(`UPDATE users SET ${restriction} WHERE id=$1`, [draftOwner]);
        pending = saveApplicationDraft(draftOwner, { expectedRevision: first.revision, fields: {} }).then(() => 'saved', error => error);
        await waitForBlockedTransaction(database, pid);
        await blocker.query('COMMIT');
        expect(await pending).toMatchObject({ statusCode: 403 });
        await expect(getApplicationDraft(draftOwner)).rejects.toMatchObject({ statusCode: 403 });
        await expect(deleteApplicationDraft(draftOwner, { expectedRevision: first.revision })).rejects.toMatchObject({ statusCode: 403 });
      } finally { await blocker.query('ROLLBACK'); if (pending) await pending; blocker.release(); }
      await database.query('UPDATE users SET is_active=TRUE,is_flagged_fraud=FALSE WHERE id=$1', [draftOwner]);
    }
    expect((await database.query('SELECT * FROM users ORDER BY id')).rows).toEqual(ownerBefore);
    await expect(getApplicationDraft('cccccccc-cccc-4ccc-8ccc-cccccccccccc')).rejects.toMatchObject({ statusCode: 403 });

    await database.query('INSERT INTO providers (user_id) VALUES ($1)', [draftOwner]);
    for (const request of [() => getApplicationDraft(draftOwner),
      () => saveApplicationDraft(draftOwner, { expectedRevision: first.revision, fields: {} }),
      () => deleteApplicationDraft(draftOwner, { expectedRevision: first.revision })]) {
      await expect(request()).rejects.toMatchObject({ statusCode: 409, code: 'provider_application_already_submitted' });
    }
    expect((await database.query('SELECT * FROM provider_application_drafts')).rows).toEqual(draftBefore);
    expect((await database.query('SELECT status FROM providers')).rows).toEqual([{ status: 'pending' }]);
  });
}, 30000);

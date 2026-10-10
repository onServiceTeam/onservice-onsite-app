import { getApplicationDraft, saveApplicationDraft, purgeExpiredApplicationDrafts } from '../src/services/provider-application-draft.service';
import { draftIntegrationIt as it, withDraftDatabase, draftOwner, otherDraftOwner, expireDraft } from './helpers/provider-draft-postgres';

it('Bug OPS-488 — the real draft migration enforces private row bounds and cleanup removes only unlocked expired drafts in bounded batches', async () => {
  await withDraftDatabase(async database => {
    const draft = await saveApplicationDraft(draftOwner, { expectedRevision: null, fields: {} });
    const other = await saveApplicationDraft(otherDraftOwner, { expectedRevision: null, fields: { businessName: 'Keep active' } });
    for (const payload of [[], { icAgreementAccepted: true }, { governmentIdFrontUrl: `onboarding/${otherDraftOwner}/front.jpg` },
      { governmentIdBackUrl: `onboarding/${otherDraftOwner}/back.jpg` }, { nbiClearanceUrl: 'public/nbi.jpg' },
      { selfieUrl: 'https://public.example/selfie.jpg' }, { businessName: 'x'.repeat(20001) }]) {
      await expect(database.query('UPDATE provider_application_drafts SET application_fields=$1::jsonb WHERE user_id=$2',
        [JSON.stringify(payload), draftOwner])).rejects.toMatchObject({ code: '23514' });
    }
    await expect(database.query('UPDATE provider_application_drafts SET expires_at=saved_at WHERE user_id=$1', [draftOwner]))
      .rejects.toMatchObject({ code: '23514' });
    expect(await getApplicationDraft(draftOwner)).toEqual(draft);
    expect(await purgeExpiredApplicationDrafts()).toBe(0);
    for (const limit of [0, -1, 501, 1.5, NaN]) await expect(purgeExpiredApplicationDrafts(limit)).rejects.toMatchObject({ statusCode: 400 });
    await expireDraft(database);
    expect(await getApplicationDraft(draftOwner)).toBeNull();
    const blocker = await database.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT user_id FROM provider_application_drafts WHERE user_id=$1 FOR UPDATE', [draftOwner]);
      expect(await purgeExpiredApplicationDrafts(1)).toBe(0);
      await blocker.query('COMMIT');
    } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    expect(await purgeExpiredApplicationDrafts(1)).toBe(1);
    expect(await purgeExpiredApplicationDrafts(1)).toBe(0);
    expect(await getApplicationDraft(otherDraftOwner)).toEqual(other);
    expect((await database.query('SELECT id FROM users ORDER BY id')).rows).toEqual([{ id: draftOwner }, { id: otherDraftOwner }]);

    await saveApplicationDraft(draftOwner, { expectedRevision: null, fields: {} });
    await expireDraft(database);
    await expireDraft(database, otherDraftOwner);
    expect(await purgeExpiredApplicationDrafts(1)).toBe(1);
    expect((await database.query('SELECT count(*)::int AS count FROM provider_application_drafts')).rows).toEqual([{ count: 1 }]);
    expect(await purgeExpiredApplicationDrafts(1)).toBe(1);
    expect((await database.query('SELECT count(*)::int AS count FROM provider_application_drafts')).rows).toEqual([{ count: 0 }]);
  });
}, 30000);

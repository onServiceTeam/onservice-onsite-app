import { getApplicationDraft, saveApplicationDraft, deleteApplicationDraft } from '../src/services/provider-application-draft.service';
import { draftIntegrationIt as it, withDraftDatabase, draftOwner, expireDraft } from './helpers/provider-draft-postgres';

it('Bug OPS-487 — concurrent or stale draft writes and discards cannot overwrite newer work, including expiry and recreation', async () => {
  await withDraftDatabase(async database => {
    const conflict = { statusCode: 409, code: 'provider_application_draft_conflict' };
    const firstSaves = await Promise.allSettled(['First tab', 'Second tab'].map(businessName =>
      saveApplicationDraft(draftOwner, { expectedRevision: null, fields: { businessName } })));
    expect(firstSaves.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(firstSaves.filter(result => result.status === 'rejected')).toEqual([{ status: 'rejected', reason: expect.objectContaining(conflict) }]);
    const first = (await getApplicationDraft(draftOwner))!;
    const replacements = await Promise.allSettled(['New first tab', 'New second tab'].map(businessName =>
      saveApplicationDraft(draftOwner, { expectedRevision: first.revision, fields: { businessName } })));
    expect(replacements.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(replacements.filter(result => result.status === 'rejected')).toEqual([{ status: 'rejected', reason: expect.objectContaining(conflict) }]);
    const current = (await getApplicationDraft(draftOwner))!;
    expect(current.revision).not.toBe(first.revision);
    expect(current.createdAt).toBe(first.createdAt);
    await expect(deleteApplicationDraft(draftOwner, { expectedRevision: first.revision })).rejects.toMatchObject(conflict);
    await expect(saveApplicationDraft(draftOwner, { expectedRevision: null, fields: {} })).rejects.toMatchObject(conflict);
    expect(await getApplicationDraft(draftOwner)).toEqual(current);

    // A genuine DB failure rolls back the prior revision and content.
    await database.query("ALTER TABLE provider_application_drafts ADD CONSTRAINT reject_fixture_name CHECK (application_fields->>'businessName' != 'Reject me')");
    await expect(saveApplicationDraft(draftOwner, { expectedRevision: current.revision, fields: { businessName: 'Reject me' } }))
      .rejects.toMatchObject({ code: '23514' });
    expect(await getApplicationDraft(draftOwner)).toEqual(current);
    await database.query('ALTER TABLE provider_application_drafts DROP CONSTRAINT reject_fixture_name');

    await expireDraft(database);
    expect(await getApplicationDraft(draftOwner)).toBeNull();
    await expect(saveApplicationDraft(draftOwner, { expectedRevision: current.revision, fields: {} })).rejects.toMatchObject(conflict);
    const afterExpiry = await saveApplicationDraft(draftOwner, { expectedRevision: null, fields: { businessName: 'New after expiry' } });
    expect(afterExpiry.revision).not.toBe(current.revision);
    expect(afterExpiry.fields.governmentIdFrontUrl).toBeNull();
    await expect(deleteApplicationDraft(draftOwner, { expectedRevision: current.revision })).rejects.toMatchObject(conflict);
    await deleteApplicationDraft(draftOwner, { expectedRevision: afterExpiry.revision });
    await deleteApplicationDraft(draftOwner, { expectedRevision: afterExpiry.revision });
    expect(await getApplicationDraft(draftOwner)).toBeNull();
    const recreated = await saveApplicationDraft(draftOwner, { expectedRevision: null, fields: {} });
    expect(recreated.revision).not.toBe(afterExpiry.revision);
    await expect(deleteApplicationDraft(draftOwner, { expectedRevision: afterExpiry.revision })).rejects.toMatchObject(conflict);
    expect(await getApplicationDraft(draftOwner)).toEqual(recreated);
  });
}, 30000);

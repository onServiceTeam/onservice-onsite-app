import { saveApplicationDraft } from '../src/services/provider-application-draft.service';
import { providerApplicationDraftFieldsSchema } from '../src/validators/provider-application-draft.validators';
import { pool } from '../src/config/database.config';
import { draftOwner, otherDraftOwner } from './helpers/provider-draft-postgres';

it('Bug OPS-485 — incomplete application drafts accept only bounded typed fields and owned private document references', async () => {
  const empty = providerApplicationDraftFieldsSchema.parse({});
  expect(empty).toMatchObject({ businessName: '', categoryIds: [], latitude: null, longitude: null,
    nbiExpiryDate: null, governmentIdNumber: null, vettingAnswers: { mainSkills: '', references: [] } });
  expect(providerApplicationDraftFieldsSchema.parse({ vettingAnswers: { references: [{ name: 'Unfinished' }] } }))
    .toMatchObject({ vettingAnswers: { references: [{ name: 'Unfinished', contact: '', relation: '' }] } });
  expect(providerApplicationDraftFieldsSchema.parse({ nbiExpiryDate: '2028-02-29' }).nbiExpiryDate).toBe('2028-02-29');
  for (const fields of [
    { businessName: 'x'.repeat(201) }, { categoryIds: Array(11).fill(draftOwner) },
    { serviceAreaId: 'not-a-uuid' }, { latitude: 0 }, { longitude: 128 }, { serviceRadiusKm: 101 },
    { nbiExpiryDate: '2027-02-29' }, { nbiExpiryDate: '0000-01-01' }, { nbiExpiryDate: '2028-13-01' },
    { governmentIdNumber: 'x'.repeat(65) }, { yearsExperience: 61 },
    { icAgreementAccepted: true }, { status: 'approved' }, { userId: otherDraftOwner },
    { vettingAnswers: { secretNotes: 'not accepted' } },
    { vettingAnswers: { references: [{ name: '', contact: '', internal: true }] } },
    { vettingAnswers: { references: Array(4).fill({}) } },
  ]) {
    await expect(saveApplicationDraft(draftOwner, { expectedRevision: null, fields }))
      .rejects.toMatchObject({ statusCode: 400 });
  }
  for (const field of ['governmentIdFrontUrl', 'governmentIdBackUrl', 'nbiClearanceUrl', 'selfieUrl']) {
    for (const reference of [`onboarding/${otherDraftOwner}/front.jpg`, `onboarding/${draftOwner}-other/front.jpg`,
      `onboarding/${draftOwner}/../front.jpg`, `booking/${draftOwner}/front.jpg`, 'file:///private.jpg', '', ' '.repeat(5)]) {
      await expect(saveApplicationDraft(draftOwner, { expectedRevision: null, fields: { [field]: reference } }))
        .rejects.toMatchObject({ statusCode: 400 });
    }
  }
  for (const input of [{ fields: {} }, { expectedRevision: 'bad', fields: {} },
    { expectedRevision: null, fields: {}, userId: otherDraftOwner }]) {
    await expect(saveApplicationDraft(draftOwner, input)).rejects.toMatchObject({ statusCode: 400 });
  }
  // Individually valid fields can still exceed the encoded UTF-8 budget.
  await expect(saveApplicationDraft(draftOwner, { expectedRevision: null, fields: {
    businessName: '界'.repeat(200), city: '界'.repeat(100), province: '界'.repeat(100),
    governmentIdFrontUrl: `onboarding/${draftOwner}/${'x'.repeat(1900)}`,
    governmentIdBackUrl: `onboarding/${draftOwner}/${'x'.repeat(1900)}`,
    nbiClearanceUrl: `onboarding/${draftOwner}/${'x'.repeat(1900)}`,
    selfieUrl: `onboarding/${draftOwner}/${'x'.repeat(1900)}`,
    vettingAnswers: { credentials: '界'.repeat(1000), registrations: '界'.repeat(1000), mainSkills: '界'.repeat(500) },
  } })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('too large') });
  // Every rejection above happens before any database connection is acquired.
  expect(pool.connect).not.toHaveBeenCalled();
});

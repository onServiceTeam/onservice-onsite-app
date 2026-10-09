import { z } from 'zod';
import api from './api';
import { draftFieldsSchema, type ApplicationDraftFields } from './provider-application-draft.service';

/** Normalize once, BEFORE saving. PUT and POST must describe the same version. */
export function prepareApplicationSubmission(input: ApplicationDraftFields): ApplicationDraftFields {
  const vetting = Object.fromEntries(Object.entries(input.vettingAnswers).map(([key, value]) =>
    [key, typeof value === 'string' ? value.trim() : value]));
  const parsed = draftFieldsSchema.safeParse({
    ...input, businessName: input.businessName.trim(), categoryIds: [...new Set(input.categoryIds)],
    city: input.city.trim(), province: input.province.trim(),
    nbiExpiryDate: input.nbiExpiryDate?.trim() || null,
    governmentIdNumber: input.governmentIdNumber?.trim() || null,
    vettingAnswers: { ...vetting, references: input.vettingAnswers.references.map(reference => ({
      name: reference.name.trim(), contact: reference.contact.trim(), relation: reference.relation.trim(),
    })) },
  });
  if (!parsed.success) throw new Error('Check your application details, dates and field lengths before submitting.');
  const fields = parsed.data;
  if (fields.businessName.length < 2 || fields.categoryIds.length === 0) {
    throw new Error('Return to Services and complete your business name and service categories.');
  }
  if (!fields.serviceAreaId || fields.latitude === null || fields.longitude === null || !fields.city || !fields.province) {
    throw new Error('Return to Service area and select your market and location.');
  }
  if (fields.yearsExperience === null || fields.vettingAnswers.mainSkills.length < 2
    || fields.vettingAnswers.references.length === 0
    || fields.vettingAnswers.references.some(reference => reference.name.length < 2 || reference.contact.length < 5)) {
    throw new Error('Return to Experience and references. Complete every reference, or explicitly remove an extra unfinished reference.');
  }
  if (!fields.governmentIdFrontUrl || !fields.governmentIdBackUrl || !fields.nbiClearanceUrl || !fields.selfieUrl) {
    throw new Error('Return to Documents and Selfie and complete all four uploads.');
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (fields.nbiExpiryDate && fields.nbiExpiryDate < today) throw new Error('Return to Documents and check your expired NBI clearance.');
  return fields;
}

export async function submitSavedApplication(fields: ApplicationDraftFields, draftRevision: string): Promise<void> {
  const { nbiExpiryDate, governmentIdNumber, yearsExperience, ...required } = fields;
  const response = await api.post<unknown>('/api/v1/providers/apply', {
    ...required, draftRevision, icAgreementAccepted: true,
    ...(nbiExpiryDate !== null ? { nbiExpiryDate } : {}),
    ...(governmentIdNumber !== null ? { governmentIdNumber } : {}),
    ...(yearsExperience !== null ? { yearsExperience } : {}),
  });
  const confirmed = z.object({ success: z.literal(true), data: z.object({ id: z.string().uuid() }) }).safeParse(response.data);
  if (response.status !== 201 || !confirmed.success) {
    throw new Error('The server response did not confirm your application. Check application status before trying again.');
  }
}

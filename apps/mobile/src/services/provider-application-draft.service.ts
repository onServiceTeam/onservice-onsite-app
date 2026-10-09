import { z } from 'zod';
import api from './api';
import type { OnboardingState } from '@/stores/onboarding.store';

// Client mirror of the API's strict, incomplete draft contract. Deliberately
// separate from final application validation: a draft is not an application.
const text = (max: number): z.ZodDefault<z.ZodString> => z.string().max(max).default('');
const document = z.string().min(1).max(2048).nullable().default(null);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !value.startsWith('0000-') && Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === value;
}, 'Enter a real calendar date');

export const draftFieldsSchema = z.object({
  businessName: text(200), categoryIds: z.array(z.string().uuid()).max(10).default([]),
  serviceAreaId: z.string().uuid().nullable().default(null),
  serviceRadiusKm: z.number().int().min(1).max(100).default(10),
  latitude: z.number().min(4.5).max(21.5).nullable().default(null),
  longitude: z.number().min(116).max(127.5).nullable().default(null),
  city: text(100), province: text(100),
  governmentIdFrontUrl: document, governmentIdBackUrl: document,
  nbiClearanceUrl: document, selfieUrl: document,
  nbiExpiryDate: calendarDate.nullable().default(null),
  governmentIdNumber: z.string().max(64).nullable().default(null),
  yearsExperience: z.number().int().min(0).max(60).nullable().default(null),
  vettingAnswers: z.object({
    mainSkills: text(500), hasOwnTools: z.boolean().default(false),
    businessType: text(40), yearStarted: text(8), teamSize: text(40),
    fullAddress: text(300), website: text(200), facebook: text(200),
    socialOther: text(300), credentials: text(1000), registrations: text(1000),
    resumeUrl: text(300),
    references: z.array(z.object({ name: text(120), contact: text(60), relation: text(60) }).strict()).max(3).default([]),
  }).strict().prefault({}),
}).strict();

export type ApplicationDraftFields = z.infer<typeof draftFieldsSchema>;
const draftSchema = z.object({
  revision: z.string().uuid(), fields: draftFieldsSchema,
  createdAt: z.iso.datetime(), savedAt: z.iso.datetime(), expiresAt: z.iso.datetime(),
}).strict().refine(draft => draft.createdAt <= draft.savedAt && draft.savedAt < draft.expiresAt);
export type ApplicationDraft = z.infer<typeof draftSchema>;
const endpoint = '/api/v1/providers/application-draft';

function parseDraftResponse(body: unknown, ownerId: string): ApplicationDraft | null {
  const envelope = z.object({ success: z.literal(true), data: draftSchema.nullable() }).strict().safeParse(body);
  if (!envelope.success) throw new Error('The saved application could not be read. Please retry.');
  const draft = envelope.data.data;
  if (draft) {
    const keys = [draft.fields.governmentIdFrontUrl, draft.fields.governmentIdBackUrl,
      draft.fields.nbiClearanceUrl, draft.fields.selfieUrl];
    if (keys.some(key => key !== null && (!key.startsWith(`onboarding/${ownerId.toLowerCase()}/`)
      || key.includes('..') || key.includes('\\') || key.includes('?') || key.includes('#')))) {
      throw new Error('The saved document references could not be verified. Please retry.');
    }
  }
  return draft;
}

export async function getApplicationDraft(ownerId: string): Promise<ApplicationDraft | null> {
  const response = await api.get<unknown>(endpoint);
  return parseDraftResponse(response.data, ownerId);
}

export async function putApplicationDraft(
  ownerId: string, expectedRevision: string | null, fields: ApplicationDraftFields,
): Promise<ApplicationDraft> {
  const parsed = draftFieldsSchema.safeParse(fields);
  if (!parsed.success) throw new Error('Some draft fields are invalid. Check dates, experience, references and field lengths, then save again.');
  const response = await api.put<unknown>(endpoint, { expectedRevision, fields: parsed.data });
  const saved = parseDraftResponse(response.data, ownerId);
  if (!saved || saved.revision === expectedRevision) throw new Error('The save could not be confirmed. Reload the saved draft before trying again.');
  return saved;
}

export async function deleteApplicationDraft(expectedRevision: string): Promise<void> {
  const response = await api.delete<unknown>(endpoint, { body: { expectedRevision } });
  if (response.status !== 204) throw new Error('The discard could not be confirmed. Reload the saved draft before trying again.');
}

export function applicationFieldsFromStore(state: OnboardingState): ApplicationDraftFields {
  return {
    businessName: state.businessName, categoryIds: [...state.categoryIds],
    serviceAreaId: state.serviceAreaId, serviceRadiusKm: state.serviceRadiusKm,
    latitude: state.latitude, longitude: state.longitude, city: state.city, province: state.province,
    governmentIdFrontUrl: state.governmentIdFrontUri, governmentIdBackUrl: state.governmentIdBackUri,
    nbiClearanceUrl: state.nbiClearanceUri, selfieUrl: state.selfieUri,
    nbiExpiryDate: state.nbiExpiryDate, governmentIdNumber: state.governmentIdNumber,
    yearsExperience: state.yearsExperience,
    vettingAnswers: { ...state.vetting, references: state.vetting.references.map(reference => ({ ...reference })) },
  };
}

export function applicationStoreFields(fields: ApplicationDraftFields): Partial<OnboardingState> {
  return {
    selectedRole: 'provider', businessName: fields.businessName, categoryIds: [...fields.categoryIds],
    serviceAreaId: fields.serviceAreaId, serviceRadiusKm: fields.serviceRadiusKm,
    latitude: fields.latitude, longitude: fields.longitude, city: fields.city, province: fields.province,
    governmentIdFrontUri: fields.governmentIdFrontUrl, governmentIdBackUri: fields.governmentIdBackUrl,
    nbiClearanceUri: fields.nbiClearanceUrl, selfieUri: fields.selfieUrl,
    nbiExpiryDate: fields.nbiExpiryDate, governmentIdNumber: fields.governmentIdNumber,
    yearsExperience: fields.yearsExperience,
    vetting: { ...fields.vettingAnswers, references: fields.vettingAnswers.references.map(reference => ({ ...reference })) },
    // Consent is never evidence contained in a saved draft.
    icAgreed: false,
  };
}

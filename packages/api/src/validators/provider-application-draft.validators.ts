import { z } from 'zod';
import { phLatitude, phLongitude } from './ph-coords';

// A draft may be incomplete, but never unconstrained. Do not reuse the old
// onboarding-progress data_snapshot or persist agreement acceptance in a draft.
const text = (max: number): z.ZodDefault<z.ZodString> => z.string().max(max).default('');
const reference = z.string().min(1).max(2048).nullable().default(null);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  if (value.startsWith('0000-')) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Enter a real calendar date');

export const providerApplicationDraftFieldsSchema = z.object({
  businessName: text(200),
  categoryIds: z.array(z.string().uuid()).max(10).default([]),
  serviceAreaId: z.string().uuid().nullable().default(null),
  serviceRadiusKm: z.number().int().min(1).max(100).default(10),
  latitude: phLatitude.nullable().default(null),
  longitude: phLongitude.nullable().default(null),
  city: text(100), province: text(100),
  governmentIdFrontUrl: reference, governmentIdBackUrl: reference,
  nbiClearanceUrl: reference, selfieUrl: reference,
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

export const saveProviderApplicationDraftSchema = z.object({
  // null means start a new draft after a fresh read found no active draft.
  // Each successful replacement gets a new UUID, including after expiry.
  expectedRevision: z.string().uuid().nullable(),
  fields: providerApplicationDraftFieldsSchema,
}).strict();

export const deleteProviderApplicationDraftSchema = z.object({ expectedRevision: z.string().uuid() }).strict();
export type ProviderApplicationDraftFields = z.infer<typeof providerApplicationDraftFieldsSchema>;

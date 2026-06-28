import { z } from 'zod';
// MED-M06 fix — both lat/lng usages in this file now share the
// canonical phLatitude/phLongitude (4.5..21.5 / 116..127.5). Pre-fix
// updateProfileSchema used the loose 4..22 / 116..128 band which
// contradicted providerApplicationSchema 8 lines above and
// migration 074 CHECKs.
import { phLatitude, phLongitude } from './ph-coords';

const urlString = z.string().url('Must be a valid URL');

// Phase K MED-K07 fix — accept optional nbiExpiryDate + idNumber
// during provider onboarding. Pre-fix the schema dropped both fields
// even if the client sent them, so the providers row insert had no
// place to store them and the NBI lifecycle banner (CRIT-118) had to
// fall back to status='missing' until an admin manually backfilled
// the column. Post-fix: optional + ISO-8601 date format check; the
// admin-manual workflow still works for legacy applicants.
const isoDateString = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  'Date must be in YYYY-MM-DD format',
);

export const providerApplicationSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(200),
  categoryIds: z.array(z.string().uuid()).min(1, 'Select at least one service category').max(10),
  serviceRadiusKm: z.number().int().min(1, 'Minimum service radius is 1km').max(50, 'Maximum service radius is 50km'),
  latitude: phLatitude,
  longitude: phLongitude,
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  governmentIdFrontUrl: urlString,
  governmentIdBackUrl: urlString,
  nbiClearanceUrl: urlString,
  selfieUrl: urlString,
  icAgreementAccepted: z.literal(true, 'You must accept the Independent Contractor agreement'),
  // K-MED-K07: optional NBI expiry + ID number fields.
  nbiExpiryDate: isoDateString.optional(),
  governmentIdNumber: z.string().min(1).max(64).optional(),
  // 2026-06-28: optional vetting questionnaire captured in onboarding (after the
  // service-area step). All optional so older app builds still apply cleanly.
  // yearsExperience maps to providers.years_experience; vettingAnswers is stored
  // as the providers.vetting_answers JSONB blob (mig 136) for admin review at
  // approval. URL-ish fields are kept as plain strings (providers may paste a
  // bare domain) and length-capped; the admin UI normalizes them to links.
  yearsExperience: z.number().int().min(0).max(60).optional(),
  vettingAnswers: z
    .object({
      mainSkills: z.string().max(500).optional(),
      hasOwnTools: z.boolean().optional(),
      businessType: z.string().max(40).optional(),
      yearStarted: z.string().max(8).optional(),
      teamSize: z.string().max(40).optional(),
      fullAddress: z.string().max(300).optional(),
      website: z.string().max(200).optional(),
      facebook: z.string().max(200).optional(),
      socialOther: z.string().max(300).optional(),
      credentials: z.string().max(1000).optional(),
      registrations: z.string().max(1000).optional(),
      resumeUrl: z.string().max(300).optional(),
      references: z
        .array(
          z.object({
            name: z.string().min(1).max(120),
            contact: z.string().min(1).max(60),
            relation: z.string().max(60).optional(),
          }),
        )
        .max(3)
        .optional(),
    })
    .optional(),
});

export const updateProfileSchema = z.object({
  bio: z.string().max(1000).optional(),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  serviceRadiusKm: z.number().min(1).max(50).optional(),
  latitude: phLatitude.optional(),
  longitude: phLongitude.optional(),
  isAvailable: z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);

export const addServiceSchema = z.object({
  subcategoryId: z.string().uuid('Subcategory ID must be a valid UUID'),
  basePrice: z.number().int().positive().optional(),
});

// MED-N99 fix — POST /providers/me/availability/overrides used to do
// only manual presence-checks on overrideDate + isAvailable, with no
// validation of the date format, the start/end time format, the
// start < end relationship, or the date being non-past. A provider
// could submit `overrideDate: 'tomorrow'` and the row would be
// inserted with that literal string in a TIMESTAMP column, causing a
// crash later. Or `startTime: '99:99'` would silently store. This
// schema closes both: format validation + the start < end invariant +
// optional reason length cap.
export const availabilityOverrideSchema = z.object({
  // ISO-8601 date (YYYY-MM-DD) — HTML <input type="date"> uses this
  // and the column is `availability_overrides.override_date DATE`.
  overrideDate: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'overrideDate must be in YYYY-MM-DD format'),
  isAvailable: z.boolean(),
  // Optional time window (only meaningful when isAvailable=true).
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be a valid 24h HH:MM').optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'endTime must be a valid 24h HH:MM').optional(),
  reason: z.string().max(500, 'reason must be 500 characters or less').optional(),
})
  .refine((data) => {
    // If both times provided, end must be after start (string compare
    // works because the format is fixed-width zero-padded HH:MM).
    if (data.startTime && data.endTime) {
      return data.endTime > data.startTime;
    }
    return true;
  }, { message: 'endTime must be after startTime', path: ['endTime'] })
  .refine((data) => {
    // Don't accept overrides for dates in the past — they're useless
    // and a sign of client bug or stale form data.
    //
    // BUG-PHASE129-01 fix — pre-fix this used `new Date().getUTC*()`
    // which produces UTC-today, NOT Manila-today. In the 8-hour window
    // each day between 00:00 Manila (= 16:00 UTC of the previous day)
    // and 08:00 Manila (= 00:00 UTC), Manila and UTC differ by one
    // calendar day. A provider opening the form at 03:00 Manila on
    // day N and submitting `overrideDate: N-1` (yesterday in Manila)
    // would compare N-1 >= N-1 (UTC's still-yesterday) → pass — but
    // the date is genuinely yesterday in the launch market. Manila
    // is the canonical TZ for the platform; the same Phase 109/113
    // Manila-anchored date-string idiom applies. Lexicographic compare
    // works because YYYY-MM-DD is fixed-width zero-padded.
    const todayManilaStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    return data.overrideDate >= todayManilaStr;
  }, { message: 'overrideDate cannot be in the past', path: ['overrideDate'] });

export const setScheduleSchema = z.object({
  schedule: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
      endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
      isAvailable: z.boolean(),
    }),
  ).min(1, 'At least one schedule slot is required').max(7),
}).refine(
  (data) => {
    const days = data.schedule.map((s) => s.dayOfWeek);
    return new Set(days).size === days.length;
  },
  { message: 'Each day of week must appear only once' },
);

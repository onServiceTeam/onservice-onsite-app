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

function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

const certificationDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .refine(isRealCalendarDate, 'Enter a real calendar date');

const nullableCertificationDate = z.preprocess(
  (value) => typeof value === 'string' && value.trim().length === 0 ? null : value,
  certificationDate.nullable().optional(),
);

const nullableCertificationText = (max: number, message: string): ReturnType<typeof z.preprocess> => z.preprocess(
  (value) => typeof value === 'string' && value.trim().length === 0 ? null : value,
  z.string().trim().max(max, message).nullable().optional(),
);

const certificationUrl = z.preprocess(
  (value) => typeof value === 'string' && value.trim().length === 0 ? null : value,
  z.string()
    .trim()
    .url('Certificate photo must be a valid URL')
    .refine((value) => /^https?:\/\//i.test(value), 'Certificate photo must use HTTP or HTTPS')
    .nullable()
    .optional(),
);

function validateCertificationDates(
  data: { issuedDate?: string | null; expiryDate?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (data.issuedDate && data.expiryDate && data.expiryDate < data.issuedDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expiryDate'],
      message: 'Expiry date must be on or after the issued date',
    });
  }
  if (data.issuedDate) {
    const todayManila = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    if (data.issuedDate > todayManila) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['issuedDate'],
        message: 'Issued date cannot be in the future',
      });
    }
  }
}

const certificationFields = {
  name: z.string().trim().min(1, 'Certification name is required').max(200, 'Certification name must be 200 characters or less'),
  issuingBody: z.preprocess(
    (value) => typeof value === 'string' && value.trim().length === 0 ? undefined : value,
    z.string().trim().max(200, 'Issuing body must be 200 characters or less').optional(),
  ),
  certificateNumber: nullableCertificationText(100, 'Certificate number must be 100 characters or less'),
  certificateUrl: certificationUrl,
  issuedDate: nullableCertificationDate,
  expiryDate: nullableCertificationDate,
};

// Bug UX-091 — certification writes previously trusted manual route checks.
// That accepted impossible dates such as 2026-02-31, arbitrary URL schemes,
// unknown keys, and PATCH bodies that changed no fields.
export const providerCertificationCreateSchema = z.object(certificationFields)
  .strict()
  .superRefine(validateCertificationDates);

export const providerCertificationUpdateSchema = z.object({
  name: certificationFields.name.optional(),
  issuingBody: certificationFields.issuingBody,
  certificateNumber: certificationFields.certificateNumber,
  certificateUrl: certificationFields.certificateUrl,
  issuedDate: certificationFields.issuedDate,
  expiryDate: certificationFields.expiryDate,
}).strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'At least one certification field must be provided',
  })
  .superRefine(validateCertificationDates);

export const providerCertificationReviewSchema = z.object({
  isVerified: z.boolean(),
  reason: z.preprocess(
    (value) => typeof value === 'string' && value.trim().length === 0 ? undefined : value,
    z.string().trim().min(3, 'Reason must be at least 3 characters').max(1000, 'Reason must be 1000 characters or less').optional(),
  ),
}).strict().superRefine((data, ctx) => {
  if (!data.isVerified && !data.reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'A reason is required when removing verification',
    });
  }
});

export const providerApplicationSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(200),
  categoryIds: z.array(z.string().uuid()).min(1, 'Select at least one service category').max(10),
  // New clients send the selected admin-configured market. Optional only for
  // older pre-launch builds; the service safely infers a containing eligible
  // market from their exact coordinates when this field is absent.
  serviceAreaId: z.string().uuid().optional(),
  // 100km is the database/admin envelope. The live platform maximum is
  // enforced after parsing by settings.service so changing the Admin control
  // does not require a deploy.
  serviceRadiusKm: z.number().int().min(1, 'Minimum service radius is 1km').max(100, 'Maximum service radius is 100km'),
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
  yearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  // Retained in the parser so older clients receive the explicit review-queue
  // conflict from provider.routes instead of silently dropping the field.
  serviceRadiusKm: z.number().int().min(1).max(100).optional(),
  latitude: phLatitude.optional(),
  longitude: phLongitude.optional(),
  isAvailable: z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);

export const providerServiceAreaChangeSchema = z.object({
  areaId: z.string().uuid('Service area ID must be a valid UUID'),
  radiusKm: z.number().int().min(1).max(100),
  latitude: phLatitude,
  longitude: phLongitude,
  reason: z.string()
    .trim()
    .min(10, 'Reason must be at least 10 characters')
    .max(500, 'Reason must be 500 characters or less'),
}).strict();

export const addServiceSchema = z.object({
  subcategoryId: z.string().uuid('Subcategory ID must be a valid UUID'),
});

function blankStringToUndefined(value: unknown): unknown {
  if (typeof value === 'string' && value.trim().length === 0) return undefined;
  return value;
}

function normalizeStaffInvitePhone(value: string): string {
  const compact = value.trim().replace(/[\s().-]+/g, '');
  if (/^09\d{9}$/.test(compact)) return `+63${compact.slice(1)}`;
  if (/^639\d{9}$/.test(compact)) return `+${compact}`;
  return compact;
}

// Bug UX-080 — provider staff invites previously bypassed validation entirely.
// Invalid contact values reached the database, and strings longer than the
// provider_staff VARCHAR columns surfaced as internal errors. Accept the two PH
// phone shapes the UI teaches, normalize them to E.164, cap every field to its
// real storage contract, and reject unknown payload keys.
export const providerStaffInviteSchema = z.object({
  phone: z.preprocess(
    blankStringToUndefined,
    z.string()
      .max(30, 'Phone number is too long')
      .transform(normalizeStaffInvitePhone)
      .refine((value) => /^\+639\d{9}$/.test(value), 'Enter a valid PH mobile number, such as +63 917 123 4567')
      .optional(),
  ),
  email: z.preprocess(
    blankStringToUndefined,
    z.string()
      .trim()
      .max(254, 'Email must be 254 characters or less')
      .email('Enter a valid email address')
      .transform((value) => value.toLowerCase())
      .optional(),
  ),
  roleTitle: z.preprocess(
    blankStringToUndefined,
    z.string().trim().max(100, 'Role must be 100 characters or less').optional(),
  ),
}).strict().superRefine((data, ctx) => {
  if (!data.phone && !data.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['phone'],
      message: 'Enter a phone number or email to invite a team member',
    });
  }
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
}).strict()
  .refine((data) => {
    // An available override represents a bounded custom-hours window. Without
    // both values the calendar would claim availability without defining when.
    return !data.isAvailable || Boolean(data.startTime && data.endTime);
  }, { message: 'Available overrides need both a start time and an end time', path: ['startTime'] })
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
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Start time must be a valid 24-hour time in HH:MM format'),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'End time must be a valid 24-hour time in HH:MM format'),
      isAvailable: z.boolean(),
    }).strict().refine(
      (slot) => !slot.isAvailable || slot.endTime > slot.startTime,
      { message: 'End time must be later than start time', path: ['endTime'] },
    ),
  ).min(1, 'At least one schedule slot is required').max(7),
}).strict().refine(
  (data) => {
    const days = data.schedule.map((s) => s.dayOfWeek);
    return new Set(days).size === days.length;
  },
  { message: 'Each day of week must appear only once' },
);

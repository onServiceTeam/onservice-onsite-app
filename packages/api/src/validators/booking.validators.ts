import { z } from 'zod';
import { platformConfig } from '../config/platform.config';
import { formatPHP } from '../utils/currency';

// Phase 14 Dispatch 05 — Bug 175 + Bug 176.
//
// `servicePrice` removed from createBookingSchema entirely. The server
// resolves the canonical price from `service_subcategories.base_price`
// at booking-creation time (booking.service.ts) — clients may not
// supply a service price.
//
// Addons changed from `{id, name, price}` to `{addonId, quantity}`. The
// server resolves the canonical price from `service_addons.price` by
// looking up each `addonId`. Clients may not supply the price.
//
// `.strict()` makes the schema reject unknown keys (e.g., a client
// retrying with `servicePrice` would now fail validation outright,
// rather than silently dropping the field).
export const createBookingSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  subcategoryId: z.string().uuid('Invalid subcategory ID').optional(),
  bookingType: z.enum(['fixed_price', 'quote_based']),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  address: z.string().min(5, 'Address is required').max(500),
  barangay: z.string().min(1, 'Barangay is required').max(100),
  city: z.string().min(1, 'City is required').max(100),
  province: z.string().min(1, 'Province is required').max(100),
  latitude: z.number().min(4.5, 'Must be within Philippines').max(21.5, 'Must be within Philippines'),
  longitude: z.number().min(116, 'Must be within Philippines').max(127.5, 'Must be within Philippines'),
  scheduledAt: z.string().datetime('Invalid date format'),
  rebookedFromId: z.string().uuid('Invalid rebooking reference').optional(),
  waitlistId: z.string().uuid('Invalid waitlist ID').optional(),
  // Phase 14 Dispatch 05 — Bug 261. Customer sends only the code; server
  // resolves the discount via services/booking/promo.service.ts.
  promoCode: z.string().min(1).max(40).optional(),
  // Phase 200 — optional B2B account the booking is placed for. When present
  // and the customer is a member with an active matching contract, the
  // booking is priced at the contract's agreed_rate (server-resolved).
  businessAccountId: z.string().uuid('Invalid business account ID').optional(),
  addons: z.array(z.object({
    addonId: z.string().uuid('Invalid addon ID'),
    quantity: z.number().int().min(1).max(100),
  }).strict()).max(20).optional(),
  // D27 Phase 4b — required for hourly subcategories. The server re-clamps to
  // the subcategory's max_estimated_hours; this is only a coarse sanity bound.
  estimatedHours: z.number().positive().max(24).optional(),
}).strict().superRefine((value, context) => {
  if (value.businessAccountId && value.bookingType !== 'fixed_price') {
    context.addIssue({
      code: 'custom',
      path: ['businessAccountId'],
      message: 'Business-account billing currently supports fixed-price contracted services only.',
    });
  }
  if (value.businessAccountId && value.promoCode) {
    context.addIssue({
      code: 'custom',
      path: ['promoCode'],
      message: 'Promo codes cannot be combined with a contracted business booking.',
    });
  }
});

// MED-N91 fix — POST /bookings/pricing-preview used to do manual
// presence-checks on basePrice + scheduledAt + categoryId. Replace
// with a Zod schema for consistency and to catch malformed input
// at the middleware layer instead of the route handler.
export const pricingPreviewSchema = z.object({
  basePrice: z.number().int().positive('basePrice must be a positive integer (centavos)').max(50_000_000),
  scheduledAt: z.string().datetime('scheduledAt must be a valid ISO date'),
  categoryId: z.string().uuid('categoryId must be a valid UUID'),
  city: z.string().min(1).max(100).optional(),
  // D27 Phase 4b — hourly preview passes the estimate so the preview matches.
  estimatedHours: z.number().positive().max(24).optional(),
}).strict();

export const updateBookingStatusSchema = z.object({
  status: z.enum([
    'requested', 'quoted', 'matched', 'payment_pending', 'paid',
    'provider_en_route', 'provider_arrived', 'in_progress',
    'completed_by_provider', 'confirmed', 'disputed', 'resolved',
    'payout_ready', 'paid_out',
    'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin',
  ]),
  cancellationReason: z.string().max(500).optional(),
  // BUG-PHASE151-01 fix — pre-fix the mobile completion screen's
  // "Notes" textarea sent `notes` in the PATCH body but the validator
  // didn't declare it, so Zod silently stripped it (same MED-N85
  // class as Phase 127 device-fingerprint). The service didn't have
  // a notes parameter either, so providers' completion notes have
  // been theatrical since the feature was built. Now declared as
  // `completionNotes` (the canonical name on the bookings.completion_notes
  // column added by migration 126_phase151_bookings_completion_notes.sql)
  // — clients send `completionNotes` (the mobile screen's `notes` was
  // also renamed to match) and the service writes it to the column.
  completionNotes: z.string().max(2000).optional(),
  latitude: z.number().min(4.5, 'Must be within Philippines').max(21.5, 'Must be within Philippines').optional(),
  longitude: z.number().min(116, 'Must be within Philippines').max(127.5, 'Must be within Philippines').optional(),
});

/** A real calendar date written YYYY-MM-DD (2026-02-30 is refused, not rolled over). */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** "What's included" is capped at 300 characters on a D38 quote (critique L14, brief). */
export const QUOTE_INCLUDED_MAX_CHARS = 300;

// D38 (merged plan 2.3): a quote now carries the earliest date and time
// window, optional "could change if" text, the accept-the-budget choice and
// the provider app's idempotency key. A request without earliestDate (APK
// 1.0.3 and older) is answered with APP_UPDATE_REQUIRED by the route before
// this schema runs. quotedPrice may be left out only with acceptBudget (the
// server prices the quote at the customer's budget_max). An itemized quote
// cannot also accept the budget.
export const submitQuoteSchema = z.object({
  quotedPrice: z.number().int().min(platformConfig.minimumQuoteAmount, `Minimum quote is ${formatPHP(platformConfig.minimumQuoteAmount)}`).optional(),
  description: z.string().trim().min(10).max(2000),
  couldChangeIf: z.string().trim().max(QUOTE_INCLUDED_MAX_CHARS, '"Could change if" must be 300 characters or fewer').optional(),
  earliestDate: z.string().refine(isCalendarDate, 'Earliest date must be a real date written YYYY-MM-DD'),
  earliestTimeWindow: z.enum(['morning', 'afternoon', 'evening', 'asap']),
  acceptBudget: z.boolean().optional(),
  clientRequestId: z.string().uuid('clientRequestId must be a UUID').optional(),
  estimatedDurationMinutes: z.number().int().min(15).max(1440).optional(),
  estimatedDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().max(2000).optional(),
  portfolioPhotos: z.array(z.string().url()).max(5).optional(),
  lineItems: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    quantity: z.number().min(0.01).max(99999),
    unit: z.string().trim().min(1).max(30),
    unitPrice: z.number().int().min(1),
    itemType: z.enum(['labor', 'materials', 'equipment', 'other']).optional(),
  }).strict()).min(1).max(20).optional(),
}).strict().superRefine((value, context) => {
  if (value.description.length > QUOTE_INCLUDED_MAX_CHARS) {
    context.addIssue({
      code: 'custom',
      path: ['description'],
      message: `What's included must be ${QUOTE_INCLUDED_MAX_CHARS} characters or fewer`,
    });
  }
  if (value.acceptBudget !== true && value.quotedPrice === undefined) {
    context.addIssue({ code: 'custom', path: ['quotedPrice'], message: 'Enter your price for this job' });
  }
  if (value.acceptBudget === true && value.lineItems !== undefined) {
    context.addIssue({
      code: 'custom',
      path: ['acceptBudget'],
      message: "Accept the customer's budget or send an itemized price, not both",
    });
  }
});

// D38: declining a quote needs a reason (D38, merged plan conflict 6). The
// note is optional, kept for the back office and never shown to providers.
// A request without a reason (APK 1.0.3 and older) is answered with
// APP_UPDATE_REQUIRED by the route before this schema runs.
export const declineQuoteSchema = z.object({
  reason: z.enum(['too_expensive', 'timing', 'changed_mind', 'other']),
  note: z.string().trim().max(300, 'The note must be 300 characters or fewer').optional(),
}).strict();

// D38 (Ken, 2026-10-13): request-first booking. "Describe your job" is the
// first step for every service, so a request no longer needs 50 characters
// and 2 photos. No single item is required, but the request must tell the
// provider something: a written description with at least 10 non-space
// characters, at least one photo, at least one answered quick question, or a
// video. The mobile form (app/customer/booking/job-request.tsx) mirrors the
// rule for what it can attach today (text, photos, answers).
export const JOB_REQUEST_MIN_DESCRIPTION_CHARS = 10;
// The new app (1.0.3+) lets customers attach up to 6 photos (D38, brief). The
// server keeps the old cap of 10 so phones still on APK 1.0.1/1.0.2, whose
// form allows 10, are not refused after uploading.
export const JOB_REQUEST_MAX_PHOTOS = 10;
export const JOB_REQUEST_EMPTY_MESSAGE =
  'Tell the pro about the job: write at least 10 characters, add a photo, or answer a quick question.';

/** Characters that are not whitespace, so "          " does not count as a description. */
export function countJobDescriptionCharacters(description: string | undefined | null): number {
  return (description ?? '').replace(/\s/g, '').length;
}

/**
 * A job-request budget amount in centavos: optional, a positive whole number.
 * A 0 is read as "no budget" rather than refused. Installed APKs up to 1.0.2
 * send 0 when the customer types 0 in a budget box, and 0 never meant a real
 * price, so nothing is lost by dropping it; a 0 is never stored.
 */
const jobRequestBudget = z.preprocess(
  (value) => (value === 0 ? undefined : value),
  z.number().int('Budget must be a whole amount').positive('Budget must be more than zero').optional(),
);

function hasJobRequestAnswer(answers: Record<string, string | number | boolean> | undefined): boolean {
  if (!answers) return false;
  return Object.values(answers).some((value) => (
    typeof value === 'string' ? value.trim().length > 0 : typeof value === 'number' ? Number.isFinite(value) : true
  ));
}

export const createJobRequestSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  subcategoryId: z.string().uuid('Invalid subcategory ID').optional(),
  // Optional now (D38); stored as '' when absent because bookings.description
  // is NOT NULL DEFAULT ''.
  description: z.string().max(2000, 'Description must be 2,000 characters or fewer').default(''),
  address: z.string().min(5, 'Address is required').max(500),
  barangay: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  latitude: z.number().min(4.5, 'Must be within Philippines').max(21.5, 'Must be within Philippines'),
  longitude: z.number().min(116, 'Must be within Philippines').max(127.5, 'Must be within Philippines'),
  urgency: z.enum(['same_day', 'within_3_days', 'within_a_week', 'flexible']),
  // Centavos, like every other money field (the app sends pesos x 100 and
  // providers read it back with formatPHP). Both optional: no budget means
  // "Not sure, let the pro quote". 0 is treated as no budget (older APKs).
  budgetMin: jobRequestBudget,
  budgetMax: jobRequestBudget,
  jobPhotos: z.array(z.string().url())
    .max(JOB_REQUEST_MAX_PHOTOS, `Up to ${JOB_REQUEST_MAX_PHOTOS} photos can be attached to a request`)
    .optional(),
  jobVideoUrl: z.string().url().optional(),
  // D27 Phase 2 — structured answers to the subcategory's intake fields,
  // keyed by field_key. Validated against the field set on the client; stored
  // as-is (a bounded JSON object) for the provider to read.
  intakeAnswers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  // D38: "Not sure, let the pro quote". Refused together with a budget.
  budgetUnknown: z.boolean().optional(),
  // D38 (critique M9): the app's idempotency key for this request.
  clientRequestId: z.string().uuid('clientRequestId must be a UUID').optional(),
}).superRefine((data, context) => {
  if (data.budgetUnknown === true && (data.budgetMin != null || data.budgetMax != null)) {
    context.addIssue({
      code: 'custom',
      path: ['budgetUnknown'],
      message: 'Choose a budget or "Not sure", not both',
    });
  }
  if (data.budgetMin != null && data.budgetMax != null && data.budgetMax < data.budgetMin) {
    context.addIssue({
      code: 'custom',
      path: ['budgetMax'],
      message: 'Maximum budget must be greater than or equal to minimum budget',
    });
  }
  const hasDescription = countJobDescriptionCharacters(data.description) >= JOB_REQUEST_MIN_DESCRIPTION_CHARS;
  const hasPhoto = (data.jobPhotos?.length ?? 0) > 0;
  // D38 also counts a video. The app cannot attach one yet (Milestone 2), but
  // the API already accepts jobVideoUrl, so a request that carries one is not
  // empty.
  const hasVideo = !!data.jobVideoUrl;
  if (!hasDescription && !hasPhoto && !hasVideo && !hasJobRequestAnswer(data.intakeAnswers)) {
    context.addIssue({ code: 'custom', path: ['description'], message: JOB_REQUEST_EMPTY_MESSAGE });
  }
});

// Phase 14 Dispatch 05 — Bug 1219.
// Added `.max(1_000_000)` (₱10,000 hard sanity cap) and `.strict()`
// to prevent unbounded change-order amounts. The relative-to-service
// price 50% cap is enforced server-side in
// booking.service.ts:createChangeOrder (defense in depth).
const CHANGE_ORDER_HARD_CAP_CENTAVOS = 1_000_000;

export const createChangeOrderSchema = z
  .object({
    description: z
      .string()
      .trim()
      .min(10, 'Description must be at least 10 characters')
      .max(2000),
    // D27 Phase 3 — additionalAmount is now optional: a change order can be a
    // lump sum (this field) OR an itemized list (lineItems). When lineItems are
    // present the server recomputes the canonical total from them and ignores
    // any client-sent additionalAmount (server-canonical, same as quotes).
    additionalAmount: z
      .number()
      .int()
      .min(
        platformConfig.minimumChangeOrderAmount,
        `Minimum additional amount is ${formatPHP(platformConfig.minimumChangeOrderAmount)}`,
      )
      .max(CHANGE_ORDER_HARD_CAP_CENTAVOS, 'Change-order amount exceeds platform sanity cap')
      .optional(),
    // Parts/materials/labor breakdown. unitPrice is centavos, mirroring
    // quote line items. The server validates that the summed total still meets
    // the minimum and stays under the hard + 50%-of-service caps.
    lineItems: z
      .array(
        z.object({
          description: z.string().trim().min(1).max(500),
          quantity: z.number().min(0.01).max(99999),
          unit: z.string().trim().min(1).max(30),
          unitPrice: z.number().int().min(1).max(CHANGE_ORDER_HARD_CAP_CENTAVOS),
          itemType: z.enum(['labor', 'materials', 'equipment', 'other']).optional(),
        }),
      )
      .min(1)
      .max(20)
      .optional(),
    photos: z.array(z.string().url()).max(10).optional(),
  })
  .strict()
  .refine((d) => d.additionalAmount != null || (d.lineItems != null && d.lineItems.length > 0), {
    message: 'Provide an additional amount or at least one line item.',
    path: ['additionalAmount'],
  });

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
  latitude: z.number().min(4.5, 'Must be within Philippines').max(21.5, 'Must be within Philippines').optional(),
  longitude: z.number().min(116, 'Must be within Philippines').max(127.5, 'Must be within Philippines').optional(),
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
}).strict();

// MED-N91 fix — POST /bookings/pricing-preview used to do manual
// presence-checks on basePrice + scheduledAt + categoryId. Replace
// with a Zod schema for consistency and to catch malformed input
// at the middleware layer instead of the route handler.
export const pricingPreviewSchema = z.object({
  basePrice: z.number().int().positive('basePrice must be a positive integer (centavos)').max(50_000_000),
  scheduledAt: z.string().datetime('scheduledAt must be a valid ISO date'),
  categoryId: z.string().uuid('categoryId must be a valid UUID'),
  city: z.string().min(1).max(100).optional(),
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

export const submitQuoteSchema = z.object({
  quotedPrice: z.number().int().min(platformConfig.minimumQuoteAmount, `Minimum quote is ${formatPHP(platformConfig.minimumQuoteAmount)}`),
  description: z.string().min(10).max(2000),
  estimatedDurationMinutes: z.number().int().min(15).max(1440).optional(),
  estimatedDays: z.number().int().min(1).max(365).optional(),
  notes: z.string().max(2000).optional(),
  portfolioPhotos: z.array(z.string().url()).max(5).optional(),
  lineItems: z.array(z.object({
    description: z.string().min(1).max(500),
    quantity: z.number().min(0.01).max(99999),
    unit: z.string().min(1).max(30),
    unitPrice: z.number().int().min(1),
    itemType: z.enum(['labor', 'materials', 'equipment', 'other']).optional(),
  })).min(1).max(20).optional(),
});

export const createJobRequestSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  subcategoryId: z.string().uuid('Invalid subcategory ID').optional(),
  description: z.string().min(50, 'Description must be at least 50 characters').max(2000),
  address: z.string().min(5, 'Address is required').max(500),
  barangay: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  latitude: z.number().min(4.5, 'Must be within Philippines').max(21.5, 'Must be within Philippines').optional(),
  longitude: z.number().min(116, 'Must be within Philippines').max(127.5, 'Must be within Philippines').optional(),
  urgency: z.enum(['same_day', 'within_3_days', 'within_a_week', 'flexible']),
  budgetMin: z.number().int().min(0).optional(),
  budgetMax: z.number().int().min(0).optional(),
  jobPhotos: z.array(z.string().url()).min(2, 'At least 2 photos are required for custom quote requests').max(10),
  jobVideoUrl: z.string().url().optional(),
  // D27 Phase 2 — structured answers to the subcategory's intake fields,
  // keyed by field_key. Validated against the field set on the client; stored
  // as-is (a bounded JSON object) for the provider to read.
  intakeAnswers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
}).refine(
  (data) => {
    if (data.budgetMin != null && data.budgetMax != null) {
      return data.budgetMax >= data.budgetMin;
    }
    return true;
  },
  { message: 'Maximum budget must be greater than or equal to minimum budget', path: ['budgetMax'] },
);

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
          description: z.string().min(1).max(500),
          quantity: z.number().min(0.01).max(99999),
          unit: z.string().min(1).max(30),
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

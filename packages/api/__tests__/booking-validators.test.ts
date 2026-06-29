import {
  createBookingSchema,
  updateBookingStatusSchema,
  submitQuoteSchema,
  createChangeOrderSchema,
} from '../src/validators/booking.validators';

describe('Booking Validators', () => {
  describe('createBookingSchema', () => {
    // Phase 14 Dispatch 05 — Bug 175 + Bug 176.
    // `servicePrice` is no longer accepted; server resolves canonical price.
    // Addons must be `{addonId, quantity}` (no name, no price).
    // `.strict()` rejects unknown keys (e.g., a client retrying with
    // `servicePrice` would now fail validation outright).
    const validBooking = {
      categoryId: '550e8400-e29b-41d4-a716-446655440000',
      bookingType: 'fixed_price' as const,
      description: 'Need aircon cleaning for 2 split-type units in my condo.',
      address: '123 Ayala Avenue',
      barangay: 'Legaspi Village',
      city: 'Makati',
      province: 'Metro Manila',
      scheduledAt: '2026-04-20T09:00:00.000Z',
    };

    it('should accept a valid fixed_price booking (no servicePrice)', () => {
      const result = createBookingSchema.safeParse(validBooking);
      expect(result.success).toBe(true);
    });

    it('bug-175-no-servicePrice: rejects payload that includes servicePrice', () => {
      const result = createBookingSchema.safeParse({
        ...validBooking,
        servicePrice: 130000,
      } as unknown);
      expect(result.success).toBe(false);
    });

    it('bug-176-addon-shape: accepts new `{addonId, quantity}` shape', () => {
      const result = createBookingSchema.safeParse({
        ...validBooking,
        addons: [{ addonId: '660e8400-e29b-41d4-a716-446655440000', quantity: 2 }],
      });
      expect(result.success).toBe(true);
    });

    it('bug-176-addon-shape: rejects old `{id, name, price}` shape', () => {
      const result = createBookingSchema.safeParse({
        ...validBooking,
        addons: [
          {
            id: '660e8400-e29b-41d4-a716-446655440000',
            name: 'Extra Bathroom',
            price: 15000,
          } as unknown,
        ],
      });
      expect(result.success).toBe(false);
    });

    it('bug-176-addon-shape: rejects addon with extra keys via .strict()', () => {
      const result = createBookingSchema.safeParse({
        ...validBooking,
        addons: [
          {
            addonId: '660e8400-e29b-41d4-a716-446655440000',
            quantity: 1,
            price: 99999, // attempt to inject a price
          } as unknown,
        ],
      });
      expect(result.success).toBe(false);
    });

    it('bug-176-addon-shape: rejects quantity below 1', () => {
      const result = createBookingSchema.safeParse({
        ...validBooking,
        addons: [{ addonId: '660e8400-e29b-41d4-a716-446655440000', quantity: 0 }],
      });
      expect(result.success).toBe(false);
    });

    it('bug-176-addon-shape: rejects quantity above 100', () => {
      const result = createBookingSchema.safeParse({
        ...validBooking,
        addons: [{ addonId: '660e8400-e29b-41d4-a716-446655440000', quantity: 101 }],
      });
      expect(result.success).toBe(false);
    });

    it('bug-175-strict: rejects unknown top-level keys', () => {
      const result = createBookingSchema.safeParse({
        ...validBooking,
        evilField: 'this should be rejected',
      } as unknown);
      expect(result.success).toBe(false);
    });

    it('should accept a valid quote_based booking without price', () => {
      const result = createBookingSchema.safeParse({
        ...validBooking,
        bookingType: 'quote_based',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional lat/lng coordinates', () => {
      const result = createBookingSchema.safeParse({
        ...validBooking,
        latitude: 14.5547,
        longitude: 121.0244,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing description', () => {
      const { description: _, ...noDesc } = validBooking;
      const result = createBookingSchema.safeParse(noDesc);
      expect(result.success).toBe(false);
    });

    it('should reject too-short description', () => {
      const result = createBookingSchema.safeParse({ ...validBooking, description: 'short' });
      expect(result.success).toBe(false);
    });

    it('should reject missing address', () => {
      const { address: _, ...noAddr } = validBooking;
      const result = createBookingSchema.safeParse(noAddr);
      expect(result.success).toBe(false);
    });

    it('should reject missing barangay', () => {
      const { barangay: _, ...noBrgy } = validBooking;
      const result = createBookingSchema.safeParse(noBrgy);
      expect(result.success).toBe(false);
    });

    it('should reject invalid categoryId (not UUID)', () => {
      const result = createBookingSchema.safeParse({ ...validBooking, categoryId: 'not-uuid' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid bookingType', () => {
      const result = createBookingSchema.safeParse({ ...validBooking, bookingType: 'hourly' });
      expect(result.success).toBe(false);
    });

    it('should reject invalid scheduledAt format', () => {
      const result = createBookingSchema.safeParse({ ...validBooking, scheduledAt: 'next tuesday' });
      expect(result.success).toBe(false);
    });

    it('should reject latitude out of range', () => {
      const result = createBookingSchema.safeParse({ ...validBooking, latitude: 91 });
      expect(result.success).toBe(false);
    });
  });

  describe('updateBookingStatusSchema', () => {
    it('should accept valid status', () => {
      const result = updateBookingStatusSchema.safeParse({ status: 'matched' });
      expect(result.success).toBe(true);
    });

    it('should accept provider arrival status with location coordinates', () => {
      const result = updateBookingStatusSchema.safeParse({
        status: 'provider_arrived',
        latitude: 14.5547,
        longitude: 121.0244,
      });
      expect(result.success).toBe(true);
    });

    it('should accept cancellation with reason', () => {
      const result = updateBookingStatusSchema.safeParse({
        status: 'cancelled_by_customer',
        cancellationReason: 'Schedule conflict',
      });
      expect(result.success).toBe(true);
    });

    it('should reject status update coordinates outside the Philippines', () => {
      const result = updateBookingStatusSchema.safeParse({
        status: 'provider_arrived',
        latitude: 40.7128,
        longitude: -74.0060,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const result = updateBookingStatusSchema.safeParse({ status: 'invalid_status' });
      expect(result.success).toBe(false);
    });

    it('should reject missing status', () => {
      const result = updateBookingStatusSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('submitQuoteSchema', () => {
    it('should accept valid quote (₱100 minimum)', () => {
      const result = submitQuoteSchema.safeParse({
        quotedPrice: 150000,
        description: 'I can do this job. Will bring all tools and materials needed.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject quote below ₱100 minimum', () => {
      const result = submitQuoteSchema.safeParse({
        quotedPrice: 5000,
        description: 'Too cheap to be real.',
      });
      expect(result.success).toBe(false);
    });

    it('should reject too-short description', () => {
      const result = submitQuoteSchema.safeParse({
        quotedPrice: 150000,
        description: 'ok',
      });
      expect(result.success).toBe(false);
    });

    it('should accept optional estimated duration', () => {
      const result = submitQuoteSchema.safeParse({
        quotedPrice: 250000,
        description: 'Full kitchen cabinet set. Will take about 2 days.',
        estimatedDurationMinutes: 960,
      });
      expect(result.success).toBe(true);
    });

    it('should reject duration less than 15 minutes', () => {
      const result = submitQuoteSchema.safeParse({
        quotedPrice: 150000,
        description: 'Quick job, no problem.',
        estimatedDurationMinutes: 5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Bug 1219 — createChangeOrderSchema', () => {
    const validChangeOrder = {
      description: 'Found additional damage requiring extra parts.',
      additionalAmount: 50000, // ₱500
    };

    it('accepts a valid change order', () => {
      expect(createChangeOrderSchema.safeParse(validChangeOrder).success).toBe(true);
    });

    it('bug-1219-server-resolves: rejects amount above ₱10,000 sanity cap', () => {
      const result = createChangeOrderSchema.safeParse({
        ...validChangeOrder,
        additionalAmount: 1_000_001,
      });
      expect(result.success).toBe(false);
    });

    it('accepts amount exactly at the ₱10,000 cap', () => {
      const result = createChangeOrderSchema.safeParse({
        ...validChangeOrder,
        additionalAmount: 1_000_000,
      });
      expect(result.success).toBe(true);
    });

    it('rejects amount below the platform minimum (₱1.00 = 100 centavos)', () => {
      const result = createChangeOrderSchema.safeParse({
        ...validChangeOrder,
        additionalAmount: 50, // below the 100-centavo platform min
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer amount', () => {
      const result = createChangeOrderSchema.safeParse({
        ...validChangeOrder,
        additionalAmount: 50_000.5,
      });
      expect(result.success).toBe(false);
    });

    it('rejects too-short description', () => {
      const result = createChangeOrderSchema.safeParse({
        ...validChangeOrder,
        description: 'short',
      });
      expect(result.success).toBe(false);
    });

    it('rejects unknown keys via .strict()', () => {
      const result = createChangeOrderSchema.safeParse({
        ...validChangeOrder,
        evilField: 'x',
      } as unknown);
      expect(result.success).toBe(false);
    });

    it('rejects more than 10 photos', () => {
      const result = createChangeOrderSchema.safeParse({
        ...validChangeOrder,
        photos: Array.from({ length: 11 }, (_, i) => `https://example.com/p${i}.jpg`),
      });
      expect(result.success).toBe(false);
    });

    // D27 Phase 3 — itemized change orders.
    it('accepts a change order with line items and no explicit amount', () => {
      const result = createChangeOrderSchema.safeParse({
        description: 'Replace faucet and pipe section.',
        lineItems: [
          { description: 'Faucet', quantity: 1, unit: 'unit', unitPrice: 30000, itemType: 'materials' },
          { description: 'Labor', quantity: 1, unit: 'hour', unitPrice: 15000, itemType: 'labor' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects a change order with neither an amount nor line items', () => {
      const result = createChangeOrderSchema.safeParse({
        description: 'No money and no items at all here.',
      });
      expect(result.success).toBe(false);
    });

    it('rejects a line item with a zero unit price', () => {
      const result = createChangeOrderSchema.safeParse({
        description: 'Replace faucet and pipe section.',
        lineItems: [{ description: 'Faucet', quantity: 1, unit: 'unit', unitPrice: 0, itemType: 'materials' }],
      });
      expect(result.success).toBe(false);
    });

    it('rejects an invalid line-item type', () => {
      const result = createChangeOrderSchema.safeParse({
        description: 'Replace faucet and pipe section.',
        lineItems: [{ description: 'Faucet', quantity: 1, unit: 'unit', unitPrice: 30000, itemType: 'gadget' }],
      } as unknown);
      expect(result.success).toBe(false);
    });
  });
});

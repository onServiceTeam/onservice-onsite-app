import { z } from 'zod';

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
  servicePrice: z.number().int().min(0).optional(),
  rebookedFromId: z.string().uuid('Invalid rebooking reference').optional(),
  waitlistId: z.string().uuid('Invalid waitlist ID').optional(),
});

export const updateBookingStatusSchema = z.object({
  status: z.enum([
    'requested', 'quoted', 'matched', 'payment_pending', 'paid',
    'provider_en_route', 'provider_arrived', 'in_progress',
    'completed_by_provider', 'confirmed', 'disputed', 'resolved',
    'payout_ready', 'paid_out',
    'cancelled_by_customer', 'cancelled_by_provider', 'cancelled_by_admin',
  ]),
  cancellationReason: z.string().max(500).optional(),
});

export const submitQuoteSchema = z.object({
  quotedPrice: z.number().int().min(10000, 'Minimum quote is ₱100.00'),
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
}).refine(
  (data) => {
    if (data.budgetMin != null && data.budgetMax != null) {
      return data.budgetMax >= data.budgetMin;
    }
    return true;
  },
  { message: 'Maximum budget must be greater than or equal to minimum budget', path: ['budgetMax'] },
);

export const createChangeOrderSchema = z.object({
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  additionalAmount: z.number().int().min(100, 'Minimum additional amount is ₱1.00'),
  photos: z.array(z.string().url()).max(10).optional(),
});

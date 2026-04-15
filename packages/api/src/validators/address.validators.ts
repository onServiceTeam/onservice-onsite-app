import { z } from 'zod';

export const createAddressSchema = z.object({
  label: z.enum(['Home', 'Work', 'Other']),
  fullAddress: z.string().min(5, 'Full address is required').max(500),
  barangay: z.string().min(1, 'Barangay is required').max(100),
  city: z.string().min(1, 'City/Municipality is required').max(100),
  province: z.string().min(1, 'Province is required').max(100),
  region: z.string().max(100).optional(),
  zipCode: z.string().max(10).optional(),
  latitude: z.number().min(4).max(22).optional(),
  longitude: z.number().min(116).max(128).optional(),
  isDefault: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

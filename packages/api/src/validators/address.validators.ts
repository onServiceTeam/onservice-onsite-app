import { z } from 'zod';

// MED-M06 fix — standardize Philippine lat/lng bounds across all
// validators on the tight band (4.5..21.5 / 116..127.5) which matches
// migration 074 CHECK constraints. Pre-fix this file used the loose
// 4..22 / 116..128 band — accepting coords that the DB would reject
// at INSERT time. Pulled from the canonical phLatLng helper so any
// future tightening is one-edit.
import { phLatitude, phLongitude } from './ph-coords';

export const createAddressSchema = z.object({
  label: z.enum(['Home', 'Work', 'Other']),
  fullAddress: z.string().min(5, 'Full address is required').max(500),
  barangay: z.string().min(1, 'Barangay is required').max(100),
  city: z.string().min(1, 'City/Municipality is required').max(100),
  province: z.string().min(1, 'Province is required').max(100),
  region: z.string().max(100).optional(),
  zipCode: z.string().max(10).optional(),
  latitude: phLatitude.optional(),
  longitude: phLongitude.optional(),
  isDefault: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

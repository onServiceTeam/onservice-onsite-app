import { z } from 'zod';

const urlString = z.string().url('Must be a valid URL');

export const providerApplicationSchema = z.object({
  businessName: z.string().min(2, 'Business name must be at least 2 characters').max(200),
  categoryIds: z.array(z.string().uuid()).min(1, 'Select at least one service category').max(10),
  serviceRadiusKm: z.number().int().min(1, 'Minimum service radius is 1km').max(50, 'Maximum service radius is 50km'),
  latitude: z.number().min(4.5, 'Must be within Philippines').max(21.5, 'Must be within Philippines'),
  longitude: z.number().min(116, 'Must be within Philippines').max(127.5, 'Must be within Philippines'),
  city: z.string().min(1).max(100),
  province: z.string().min(1).max(100),
  governmentIdFrontUrl: urlString,
  governmentIdBackUrl: urlString,
  nbiClearanceUrl: urlString,
  selfieUrl: urlString,
  icAgreementAccepted: z.literal(true, 'You must accept the Independent Contractor agreement'),
});

export const updateProfileSchema = z.object({
  bio: z.string().max(1000).optional(),
  yearsExperience: z.number().int().min(0).max(60).optional(),
  serviceRadiusKm: z.number().min(1).max(50).optional(),
  latitude: z.number().min(4).max(22).optional(),
  longitude: z.number().min(116).max(128).optional(),
  isAvailable: z.boolean().optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined),
  { message: 'At least one field must be provided' },
);

export const addServiceSchema = z.object({
  subcategoryId: z.string().uuid('Subcategory ID must be a valid UUID'),
  basePrice: z.number().int().positive().optional(),
});

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

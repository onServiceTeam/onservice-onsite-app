import { z } from 'zod';

// D27 Phase 2 — per-subcategory intake field definitions.
export const intakeFieldSchema = z.object({
  fieldKey: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'field key must be lowercase letters, numbers, or underscores'),
  label: z.string().trim().min(1).max(120),
  helpText: z.string().trim().max(200).optional().nullable(),
  fieldType: z.enum(['number', 'text', 'choice', 'boolean']),
  unit: z.string().trim().max(30).optional().nullable(),
  options: z.array(z.string().trim().min(1).max(80)).max(20).optional().nullable(),
  placeholder: z.string().trim().max(160).optional().nullable(),
  isRequired: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const updateIntakeFieldSchema = intakeFieldSchema.partial();

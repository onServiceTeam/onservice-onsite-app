import { z } from 'zod';

export const SURGE_MULTIPLIER_MIN = 1.0;
export const SURGE_MULTIPLIER_MAX = 5.0;

const reasonSchema = z.string().trim().min(10, 'Reason must be at least 10 characters').max(2000);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD').refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Date must be a real calendar date');
const timeSchema = z.string().regex(
  /^(?:[01]\d|2[0-3]):[0-5]\d$/,
  'Time must be a valid 24-hour HH:mm value',
);

export const pricingRuleIdParamsSchema = z.object({
  id: z.string().uuid('Pricing rule ID must be a valid UUID'),
}).strict();

export const categoryScopeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('global') }).strict(),
  z.object({
    mode: z.literal('category'),
    categoryId: z.string().uuid('Category ID must be a valid UUID'),
  }).strict(),
]);

export const serviceAreaScopeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('global') }).strict(),
  z.object({
    mode: z.literal('service_area'),
    serviceAreaId: z.string().uuid('Service area ID must be a valid UUID'),
  }).strict(),
]);

const pricingFields = {
  name: z.string().trim().min(1).max(100),
  type: z.enum(['rush', 'holiday', 'peak_hours']),
  multiplier: z.number().min(SURGE_MULTIPLIER_MIN).max(SURGE_MULTIPLIER_MAX),
  rushHoursThreshold: z.number().int().min(1).max(24).optional(),
  holidayDate: dateSchema.optional(),
  peakStartTime: timeSchema.optional(),
  peakEndTime: timeSchema.optional(),
  peakDaysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  categoryScope: categoryScopeSchema,
  serviceAreaScope: serviceAreaScopeSchema,
  priority: z.number().int().min(0).max(1000).optional(),
  platformSurgeShare: z.number().min(0).max(1).optional(),
  description: z.string().trim().max(1000).optional(),
  reason: reasonSchema,
};

function validateSchedule(
  value: {
    type: 'rush' | 'holiday' | 'peak_hours';
    rushHoursThreshold?: number;
    holidayDate?: string;
    peakStartTime?: string;
    peakEndTime?: string;
  },
  context: z.RefinementCtx,
): void {
  if (value.type === 'rush' && value.rushHoursThreshold === undefined) {
    context.addIssue({ code: 'custom', path: ['rushHoursThreshold'], message: 'Rush pricing requires a threshold.' });
  }
  if (value.type === 'holiday' && value.holidayDate === undefined) {
    context.addIssue({ code: 'custom', path: ['holidayDate'], message: 'Holiday pricing requires a date.' });
  }
  if (value.type === 'peak_hours' && (!value.peakStartTime || !value.peakEndTime)) {
    context.addIssue({ code: 'custom', path: ['peakStartTime'], message: 'Peak pricing requires start and end times.' });
  }
}

export const createPricingRuleSchema = z.object(pricingFields).strict().superRefine(validateSchedule);

export const updatePricingRuleSchema = z.object({
  name: pricingFields.name.optional(),
  multiplier: pricingFields.multiplier.optional(),
  rushHoursThreshold: pricingFields.rushHoursThreshold,
  holidayDate: dateSchema.optional(),
  peakStartTime: timeSchema.optional(),
  peakEndTime: timeSchema.optional(),
  peakDaysOfWeek: pricingFields.peakDaysOfWeek,
  categoryScope: categoryScopeSchema.optional(),
  serviceAreaScope: serviceAreaScopeSchema.optional(),
  priority: pricingFields.priority,
  platformSurgeShare: pricingFields.platformSurgeShare,
  description: pricingFields.description,
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  reason: reasonSchema,
}).strict().refine(
  (value) => Object.keys(value).some((key) => key !== 'reason' && key !== 'expectedUpdatedAt'),
  'At least one draft field is required',
);

const positiveIntegerQuery = z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1));
export const pricingRuleListQuerySchema = z.object({
  page: positiveIntegerQuery.optional(),
  pageSize: positiveIntegerQuery.pipe(z.number().max(100)).optional(),
  type: z.enum(['rush', 'holiday', 'peak_hours']).optional(),
  status: z.enum(['draft', 'published', 'retired', 'legacy_active', 'legacy_inactive']).optional(),
}).strict();

export const previewPricingRuleSchema = z.object({
  samples: z.array(z.object({
    subcategoryId: z.string().uuid('Subcategory ID must be a valid UUID'),
    serviceAreaId: z.string().uuid('Service area ID must be a valid UUID'),
    scheduledAt: z.string().datetime({ offset: true }),
  }).strict()).min(1).max(12),
}).strict();

export const publishPricingRuleSchema = z.object({
  previewId: z.string().uuid('Preview ID must be a valid UUID'),
  reason: reasonSchema,
}).strict();

export const retirePricingRuleSchema = z.object({
  reason: reasonSchema,
}).strict();

export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;
export type PreviewPricingRuleInput = z.infer<typeof previewPricingRuleSchema>;

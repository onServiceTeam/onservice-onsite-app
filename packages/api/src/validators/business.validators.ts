import { z } from 'zod';

const uuid = (label: string) => z.string().uuid(`${label} must be a valid UUID`);
const optionalText = (max: number) => z.string().trim().max(max).optional();
const requiredText = (label: string, max: number) => z.string().trim().min(1, `${label} is required`).max(max);
const safeCentavos = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const calendarDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Date must be a real calendar date');

export const businessAccountParamsSchema = z.object({
  id: uuid('Business account ID'),
}).strict();

export const businessMemberParamsSchema = z.object({
  id: uuid('Business account ID'),
  userId: uuid('Business member user ID'),
}).strict();

export const businessContractParamsSchema = z.object({
  id: uuid('Business account ID'),
  contractId: uuid('Business contract ID'),
}).strict();

export const businessInvoiceParamsSchema = z.object({
  id: uuid('Business account ID'),
  invoiceId: uuid('Business invoice ID'),
}).strict();

export const businessPaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

const businessEditableFields = {
  companyName: requiredText('Company name', 200),
  businessType: requiredText('Business type', 30),
  registrationNumber: optionalText(100),
  taxId: optionalText(50),
  billingAddress: requiredText('Billing address', 1000),
  barangay: requiredText('Barangay', 100),
  city: requiredText('City', 100),
  province: requiredText('Province', 100),
  contactPerson: requiredText('Contact person', 200),
  contactEmail: z.string().trim().email('Contact email must be valid').max(255),
  contactPhone: requiredText('Contact phone', 20),
  notes: optionalText(5000),
};

export const createBusinessAccountSchema = z.object({
  ...businessEditableFields,
  paymentTerms: z.string().trim().min(1).max(20).optional(),
}).strict();

export const updateBusinessAccountSchema = z.object({
  companyName: businessEditableFields.companyName.optional(),
  businessType: businessEditableFields.businessType.optional(),
  registrationNumber: businessEditableFields.registrationNumber,
  taxId: businessEditableFields.taxId,
  billingAddress: businessEditableFields.billingAddress.optional(),
  barangay: businessEditableFields.barangay.optional(),
  city: businessEditableFields.city.optional(),
  province: businessEditableFields.province.optional(),
  contactPerson: businessEditableFields.contactPerson.optional(),
  contactEmail: businessEditableFields.contactEmail.optional(),
  contactPhone: businessEditableFields.contactPhone.optional(),
  notes: businessEditableFields.notes,
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'Provide at least one business account field to update.',
});

export const addBusinessMemberSchema = z.object({
  targetUserId: uuid('Target user ID'),
  role: z.enum(['manager', 'member']),
  canBook: z.boolean().optional(),
  canApprove: z.boolean().optional(),
  canViewInvoices: z.boolean().optional(),
}).strict();

export const removeBusinessMemberSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
}).strict();

export const transferBusinessOwnershipSchema = z.object({
  newOwnerUserId: uuid('New owner user ID'),
  reason: z.string().trim().max(1000).optional(),
}).strict();

export const createBusinessContractSchema = z.object({
  categoryId: uuid('Category ID'),
  subcategoryId: uuid('Subcategory ID').optional(),
  providerId: uuid('Provider ID').optional(),
  contractType: z.enum(['recurring', 'on_demand']),
  frequency: z.enum(['weekly', 'bi_weekly', 'monthly', 'quarterly', 'as_needed']).optional(),
  agreedRate: safeCentavos.min(1, 'Agreed rate must be at least one centavo'),
  discountPercentage: z.number().min(0).max(100).multipleOf(0.01).optional(),
  estimatedMonthlyValue: safeCentavos.optional(),
  startDate: calendarDate,
  endDate: calendarDate.optional(),
  autoRenew: z.boolean().optional(),
  terms: optionalText(5000),
}).strict().superRefine((value, context) => {
  if (value.endDate && value.endDate < value.startDate) {
    context.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'Contract end date cannot be before its start date.',
    });
  }
});

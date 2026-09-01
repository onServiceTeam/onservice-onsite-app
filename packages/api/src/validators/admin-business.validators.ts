import { z } from 'zod';

const reasonSchema = z.string().trim().min(10, 'Reason must be at least 10 characters').max(2000);
const referenceSchema = z.string().trim().min(3).max(500);
const recordVersionSchema = z.number().int().positive();
const centavosSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD').refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Date must be a real calendar date');

export const businessAccountParamsSchema = z.object({
  id: z.string().uuid('Business account ID must be a valid UUID'),
}).strict();

export const businessContractParamsSchema = z.object({
  id: z.string().uuid('Business account ID must be a valid UUID'),
  contractId: z.string().uuid('Business contract ID must be a valid UUID'),
}).strict();

export const businessInvoiceParamsSchema = z.object({
  id: z.string().uuid('Business invoice ID must be a valid UUID'),
}).strict();

export const businessInvoicePaymentParamsSchema = z.object({
  id: z.string().uuid('Business invoice ID must be a valid UUID'),
  paymentId: z.string().uuid('Business payment ID must be a valid UUID'),
}).strict();

export const businessLifecycleDecisionSchema = z.object({
  previewId: z.string().uuid('Preview ID must be a valid UUID'),
  reason: reasonSchema,
}).strict();

export const previewBusinessTermsSchema = z.object({
  expectedVersion: recordVersionSchema,
  paymentTerms: z.enum(['net_15', 'net_30', 'net_60']),
  volumeDiscountRate: z.number().min(0).max(50),
  monthlyCreditLimit: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();

export const publishBusinessTermsSchema = z.object({
  previewId: z.string().uuid('Preview ID must be a valid UUID'),
  reason: reasonSchema,
}).strict();

export const publishBusinessContractSchema = z.object({
  previewId: z.string().uuid('Preview ID must be a valid UUID'),
  reason: reasonSchema,
}).strict();

export const businessInvoicePreviewSchema = z.object({
  billingPeriodStart: dateSchema.optional(),
  billingPeriodEnd: dateSchema.optional(),
}).strict().superRefine((value, context) => {
  if ((value.billingPeriodStart === undefined) !== (value.billingPeriodEnd === undefined)) {
    context.addIssue({
      code: 'custom',
      path: ['billingPeriodEnd'],
      message: 'Provide both billing period dates or neither.',
    });
  }
  if (value.billingPeriodStart && value.billingPeriodEnd && value.billingPeriodEnd < value.billingPeriodStart) {
    context.addIssue({
      code: 'custom',
      path: ['billingPeriodEnd'],
      message: 'Billing period end cannot be before its start.',
    });
  }
});

export const prepareBusinessInvoiceSchema = z.object({
  previewId: z.string().uuid('Preview ID must be a valid UUID'),
  reason: reasonSchema,
}).strict();

export const finalizeBusinessInvoiceSchema = z.object({
  expectedVersion: recordVersionSchema,
  reason: reasonSchema,
}).strict();

export const recordBusinessInvoicePaymentSchema = z.object({
  expectedVersion: recordVersionSchema,
  amount: centavosSchema,
  currency: z.literal('PHP'),
  method: z.enum(['bank_transfer', 'cash_deposit', 'check', 'other_external']),
  effectiveAt: z.string().datetime({ offset: true }),
  externalReference: referenceSchema,
  evidenceReference: referenceSchema,
  evidenceObjectKey: z.string().trim().min(3).max(1000).optional(),
  reason: reasonSchema,
}).strict();

export const reverseBusinessInvoicePaymentSchema = z.object({
  expectedVersion: recordVersionSchema,
  amount: centavosSchema,
  currency: z.literal('PHP'),
  effectiveAt: z.string().datetime({ offset: true }),
  externalReference: referenceSchema,
  evidenceReference: referenceSchema,
  evidenceObjectKey: z.string().trim().min(3).max(1000).optional(),
  reason: reasonSchema,
}).strict();

export const recordBusinessInvoiceAdjustmentSchema = z.object({
  expectedVersion: recordVersionSchema,
  adjustmentType: z.enum(['credit', 'debit', 'write_off']),
  amount: centavosSchema,
  currency: z.literal('PHP'),
  evidenceReference: referenceSchema,
  reason: reasonSchema,
}).strict();

export const voidBusinessInvoiceSchema = z.object({
  expectedVersion: recordVersionSchema,
  reason: reasonSchema,
}).strict();

export type PreviewBusinessTermsInput = z.infer<typeof previewBusinessTermsSchema>;
export type BusinessInvoicePreviewInput = z.infer<typeof businessInvoicePreviewSchema>;
export type RecordBusinessInvoicePaymentInput = z.infer<typeof recordBusinessInvoicePaymentSchema>;
export type ReverseBusinessInvoicePaymentInput = z.infer<typeof reverseBusinessInvoicePaymentSchema>;
export type RecordBusinessInvoiceAdjustmentInput = z.infer<typeof recordBusinessInvoiceAdjustmentSchema>;

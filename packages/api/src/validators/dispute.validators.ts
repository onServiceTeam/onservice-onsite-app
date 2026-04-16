import { z } from 'zod';

const EVIDENCE_REQUIRED_TYPES = new Set(['damage', 'theft']);

export const fileDisputeSchema = z.object({
  bookingId: z.string().uuid('Booking ID must be a valid UUID'),
  type: z.enum(['no_show', 'incomplete', 'substandard', 'damage', 'theft', 'overcharge', 'other']),
  description: z.string().min(50, 'Description must be at least 50 characters').max(2000),
  evidenceUrls: z.array(
    z.object({
      url: z.string().url('Evidence URL must be valid'),
      type: z.enum(['photo', 'video', 'document']),
      description: z.string().max(500).optional(),
    }),
  ).max(10, 'Maximum 10 evidence files').optional(),
}).refine(
  (data) => {
    if (EVIDENCE_REQUIRED_TYPES.has(data.type)) {
      return data.evidenceUrls != null && data.evidenceUrls.length > 0;
    }
    return true;
  },
  { message: 'Evidence (photos/videos) is required for property damage and theft disputes', path: ['evidenceUrls'] },
);

export const providerDisputeResponseSchema = z.object({
  response: z.string().min(20, 'Response must be at least 20 characters').max(2000),
  action: z.enum(['accept', 'contest', 'partial_offer']),
  partialOfferAmount: z.number().int().positive().optional(),
}).refine(
  (data) => {
    if (data.action === 'partial_offer' && (data.partialOfferAmount == null || data.partialOfferAmount <= 0)) {
      return false;
    }
    return true;
  },
  { message: 'Partial offer amount is required when action is partial_offer' },
);

export const resolveDisputeSchema = z.object({
  resolutionType: z.enum([
    'full_refund', 'partial_refund', 'no_refund', 'free_redo',
    'refund_with_warning', 'refund_with_suspension', 'split_decision',
  ]),
  refundPercent: z.number().min(0).max(100).optional(),
  decisionNotes: z.string().min(20, 'Decision notes must be at least 20 characters').max(2000),
  internalNotes: z.string().max(2000).optional(),
}).refine(
  (data) => {
    if ((data.resolutionType === 'partial_refund' || data.resolutionType === 'split_decision') &&
        data.refundPercent == null) {
      return false;
    }
    return true;
  },
  { message: 'Refund percent is required for partial refund or split decision' },
);

export const escalateDisputeSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
});

export const assignDisputeSchema = z.object({
  assigneeId: z.string().uuid('Assignee ID must be a valid UUID'),
});

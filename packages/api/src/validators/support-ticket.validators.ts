import { z } from 'zod';
import { platformConfig } from '../config/platform.config';

const ticketType = z.enum([
  'booking_issue',
  'payment_issue',
  'provider_no_show',
  'app_bug',
  'account_issue',
  'general_inquiry',
]);

const ticketPriority = z.enum(['low', 'medium', 'high', 'urgent']);

function canonicalUuid(message: string): z.ZodType<string> {
  return z.string().uuid(message).transform((value) => value.toLowerCase());
}

const ticketStatus = z.enum([
  'open',
  'in_progress',
  'waiting_on_customer',
  'waiting_on_provider',
  'escalated',
  'resolved',
  'closed',
]);

export const supportTicketListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(platformConfig.maxPageSize).default(platformConfig.defaultPageSize),
  status: ticketStatus.optional(),
  type: ticketType.optional(),
  priority: ticketPriority.optional(),
  assignedAgentId: canonicalUuid('Invalid assigned agent ID').optional(),
  unassigned: z.enum(['1', 'true']).transform(() => true).optional(),
  active: z.enum(['1', 'true']).transform(() => true).optional(),
  search: z.string().trim().min(2).max(100).optional(),
  bookingId: canonicalUuid('Invalid booking ID').optional(),
  projectId: canonicalUuid('Invalid project ID').optional(),
  businessAccountId: canonicalUuid('Invalid business account ID').optional(),
  userId: canonicalUuid('Invalid user ID').optional(),
  relatedCustomerId: canonicalUuid('Invalid related customer ID').optional(),
  relatedProviderId: canonicalUuid('Invalid related provider ID').optional(),
}).strict().superRefine(rejectMultipleWorkContexts);

export const mySupportTicketListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(platformConfig.maxPageSize).default(platformConfig.defaultPageSize),
  status: ticketStatus.optional(),
}).strict();

const createSupportTicketFields = {
  type: ticketType,
  priority: ticketPriority.default('medium'),
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(200),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(5000),
  bookingId: canonicalUuid('Invalid booking ID').optional(),
  projectId: canonicalUuid('Invalid project ID').optional(),
  businessAccountId: canonicalUuid('Invalid business account ID').optional(),
};

function rejectMultipleWorkContexts(
  value: { bookingId?: string; projectId?: string; businessAccountId?: string },
  context: z.RefinementCtx,
): void {
  if (value.bookingId && value.projectId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['projectId'],
      message: 'A support request can be linked to a booking or a project, not both',
    });
  }
  if (value.projectId && value.businessAccountId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['businessAccountId'],
      message: 'A planning-project support request cannot be relabelled as a business account case',
    });
  }
}

export const createSupportTicketSchema = z.object(createSupportTicketFields)
  .strict()
  .superRefine(rejectMultipleWorkContexts);

export const adminCreateSupportTicketSchema = z.object({
  ...createSupportTicketFields,
  userId: canonicalUuid('Invalid user ID'),
}).strict().superRefine(rejectMultipleWorkContexts);

export const supportTicketMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(5000),
  isInternalNote: z.boolean().optional().default(false),
}).strict();

export const updateSupportTicketStatusSchema = z.object({
  status: ticketStatus,
  resolutionNotes: z.string().trim().max(5000).optional(),
  workflowNote: z.string().trim().min(10, 'Workflow note must be at least 10 characters').max(5000),
}).strict().superRefine((value, context) => {
  if (
    (value.status === 'resolved' || value.status === 'closed') &&
    (value.resolutionNotes?.length ?? 0) < 10
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['resolutionNotes'],
      message: 'Resolution notes must be at least 10 characters when resolving or closing a ticket',
    });
  }
});

export const assignSupportTicketSchema = z.object({
  agentId: canonicalUuid('Invalid agent ID'),
}).strict();

export const supportTicketIdParamsSchema = z.object({
  id: canonicalUuid('Invalid support ticket ID'),
}).strict();

export const updateSupportTicketPrioritySchema = z.object({
  priority: ticketPriority,
  workflowNote: z.string().trim().min(10, 'Workflow note must be at least 10 characters').max(5000),
}).strict();

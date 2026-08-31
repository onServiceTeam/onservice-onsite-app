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
  assignedAgentId: z.string().uuid('Invalid assigned agent ID').optional(),
  unassigned: z.enum(['1', 'true']).transform(() => true).optional(),
  active: z.enum(['1', 'true']).transform(() => true).optional(),
  search: z.string().trim().min(2).max(100).optional(),
  bookingId: z.string().uuid('Invalid booking ID').optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
  relatedCustomerId: z.string().uuid('Invalid related customer ID').optional(),
  relatedProviderId: z.string().uuid('Invalid related provider ID').optional(),
}).strict();

export const mySupportTicketListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(platformConfig.maxPageSize).default(platformConfig.defaultPageSize),
  status: ticketStatus.optional(),
}).strict();

export const createSupportTicketSchema = z.object({
  type: ticketType,
  priority: ticketPriority.default('medium'),
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(200),
  description: z.string().trim().min(5, 'Description must be at least 5 characters').max(5000),
  bookingId: z.string().uuid('Invalid booking ID').optional(),
}).strict();

export const adminCreateSupportTicketSchema = createSupportTicketSchema.extend({
  userId: z.string().uuid('Invalid user ID'),
});

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
  agentId: z.string().uuid('Invalid agent ID'),
}).strict();

export const supportTicketIdParamsSchema = z.object({
  id: z.string().uuid('Invalid support ticket ID'),
}).strict();

export const updateSupportTicketPrioritySchema = z.object({
  priority: ticketPriority,
  workflowNote: z.string().trim().min(10, 'Workflow note must be at least 10 characters').max(5000),
}).strict();

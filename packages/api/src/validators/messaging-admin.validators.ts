import { z } from 'zod';

const page = z.coerce.number().int().min(1).max(1_000_000).default(1);
const pageSize = z.coerce.number().int().min(1).max(100).default(25);

export const conversationListQuerySchema = z.object({
  filter: z.enum(['all', 'flagged', 'reported']).default('all'),
  search: z.string().trim().max(200).optional(),
  page,
  pageSize,
}).strict();

export const moderationQueueQuerySchema = z.object({
  scope: z.enum(['all', 'flagged', 'reported']).default('all'),
  page,
  pageSize,
}).strict();

export const conversationIdParamsSchema = z.object({
  id: z.string().uuid(),
}).strict();

export const messageIdParamsSchema = z.object({
  messageId: z.string().uuid(),
}).strict();

export const redactMessageSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
}).strict();

export const reviewMessageSchema = z.object({
  reviewNote: z.string().trim().min(3).max(2000),
}).strict();

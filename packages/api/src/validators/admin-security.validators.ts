import { isIP } from 'node:net';
import { z } from 'zod';

const positiveIntegerQuery = z.string().regex(/^\d+$/).transform(Number).pipe(
  z.number().int().min(1),
);

const ipAddress = z.string().trim().refine(
  (value) => isIP(value) !== 0,
  'IP address must be a valid IPv4 or IPv6 address',
);

const auditReason = z.string().trim()
  .min(10, 'Reason must be at least 10 characters')
  .max(500, 'Reason must be 500 characters or fewer');

export const blockedIpListQuerySchema = z.object({
  page: positiveIntegerQuery.optional(),
  pageSize: positiveIntegerQuery.pipe(z.number().max(100)).optional(),
}).strict();
export const blockIpBodySchema = z.object({
  ipAddress,
  reason: auditReason,
  expiresInHours: z.number().int().min(1).max(8760).optional(),
}).strict();

export const blockedIpParamsSchema = z.object({
  ipAddress,
}).strict();

export const unblockIpBodySchema = z.object({
  reason: auditReason,
}).strict();

export const securityEventListQuerySchema = z.object({
  page: positiveIntegerQuery.optional(),
  pageSize: positiveIntegerQuery.pipe(z.number().max(100)).optional(),
  userId: z.string().uuid('User ID must be a valid UUID').optional(),
  eventType: z.string().trim().regex(
    /^[a-z][a-z0-9_]{0,99}$/,
    'Event type must be a lowercase security-event slug',
  ).optional(),
  ipAddress: ipAddress.optional(),
}).strict();

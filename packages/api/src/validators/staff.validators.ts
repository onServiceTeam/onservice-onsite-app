import { z } from 'zod';
import { platformConfig } from '../config/platform.config';

const uuid = z.string().uuid('Invalid ID');
const reason = z.string().trim().min(10, 'Reason must be at least 10 characters').max(5000);
const permissions = z.array(z.string().trim().min(1).max(100)).min(1).max(100);

export const staffIdParamsSchema = z.object({ id: uuid }).strict();
export const dpoUserIdParamsSchema = z.object({ userId: uuid }).strict();

export const staffCandidateQuerySchema = z.object({
  search: z.string().trim().min(2).max(100),
  limit: z.coerce.number().int().min(1).max(20).default(20),
}).strict();

export const staffListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(platformConfig.maxPageSize).default(platformConfig.defaultPageSize),
  profileActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  profileMissing: z.enum(['true']).transform(() => true).optional(),
  accountActive: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  accountRole: z.enum(['admin', 'super_admin', 'dpo']).optional(),
  roleId: uuid.optional(),
  search: z.string().trim().min(2).max(100).optional(),
}).strict().refine(
  (value) => !(value.profileMissing && value.profileActive !== undefined),
  { message: 'Choose either a profile status or missing profiles, not both.' },
);

export const createStaffRoleSchema = z.object({
  name: z.string().trim().min(1).max(50),
  description: z.string().trim().max(500).optional().default(''),
  permissions,
  reason,
}).strict();

export const updateStaffRoleSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(500).optional(),
  permissions: permissions.optional(),
  reason,
}).strict().refine(
  (value) => value.name !== undefined || value.description !== undefined || value.permissions !== undefined,
  { message: 'At least one role profile field is required.' },
);

export const staffReasonSchema = z.object({ reason }).strict();

export const addStaffMemberSchema = z.object({
  userId: uuid,
  roleId: uuid,
  reason,
}).strict();

export const updateStaffMemberSchema = z.object({
  roleId: uuid.optional(),
  isActive: z.boolean().optional(),
  reason,
}).strict().refine(
  (value) => value.roleId !== undefined || value.isActive !== undefined,
  { message: 'Role profile or directory status is required.' },
);

export const promoteDpoSchema = z.object({ reason }).strict();
export const demoteDpoSchema = z.object({
  reason,
  demoteTo: z.enum(['admin', 'customer', 'provider']).default('admin'),
}).strict();

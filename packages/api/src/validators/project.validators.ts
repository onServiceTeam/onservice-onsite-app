import { z } from 'zod';

// D27 Phase 5 — project layer validators. Amounts are centavos (advisory only;
// no money moves per milestone — see D27p5-milestone-escrow decision).

const PROJECT_STATUS = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const;
const MILESTONE_STATUS = ['pending', 'in_progress', 'completed'] as const;
const DOC_TYPES = ['blueprint', 'permit', 'contract', 'photo', 'other'] as const;

function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

const projectDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'targetDate must be YYYY-MM-DD')
  .refine(isRealCalendarDate, 'targetDate must be a real calendar date');

export const createProjectSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  estimatedTotal: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
}).strict();

export const updateProjectSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).optional(),
  status: z.enum(PROJECT_STATUS).optional(),
  address: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().max(100).optional().nullable(),
  estimatedTotal: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
}).strict();

export const addMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  amount: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
  targetDate: projectDate.optional().nullable(),
}).strict();

export const updateMilestoneSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  status: z.enum(MILESTONE_STATUS).optional(),
  amount: z.number().int().min(0).max(2_000_000_000).optional().nullable(),
  targetDate: projectDate.optional().nullable(),
}).strict();

export const addSelectionSchema = z.object({
  category: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(200).optional().nullable(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
}).strict();

export const addDocumentSchema = z.object({
  label: z.string().trim().min(1).max(160),
  fileUrl: z.string().url().max(1000).refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  }, 'fileUrl must use http or https'),
  docType: z.enum(DOC_TYPES).optional(),
}).strict();

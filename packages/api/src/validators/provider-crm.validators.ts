import { z } from 'zod';

// D27 Phase 7b — provider CRM depth validators.

export const addClientNoteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
}).strict();

export const addReminderSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD'),
}).strict();

export const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  categoryId: z.string().uuid().optional().nullable(),
  subcategoryId: z.string().uuid().optional().nullable(),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(500),
    quantity: z.number().min(0.01).max(99999),
    unit: z.string().trim().min(1).max(30),
    unitPrice: z.number().int().min(0).max(100_000_000),
    itemType: z.enum(['labor', 'materials', 'equipment', 'other']).optional(),
  })).min(1).max(30),
}).strict();

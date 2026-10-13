import { z } from 'zod';

/**
 * POST /api/v1/job-media: start (or resume) a private upload (D38).
 * The mime type is normalised by the service (lowercased, parameters removed,
 * audio/x-m4a read as audio/mp4) before it is checked against the kind.
 * Purpose 'job_request' needs the customer role; 'chat' needs a participant
 * of an open request thread and kind photo or voice. Size and length limits
 * are checked by the service against the admin settings.
 */
export const startJobMediaSchema = z.object({
  purpose: z.enum(['job_request', 'chat']).default('job_request'),
  conversationId: z.string().uuid('Invalid conversation ID').optional(),
  kind: z.enum(['photo', 'video', 'voice']),
  mime: z.string().trim().min(3).max(100),
  totalBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  clientUploadId: z.string().uuid('Invalid upload ID'),
  durationMs: z.number().int().min(0).max(600_000).optional(),
  width: z.number().int().min(1).max(20_000).optional(),
  height: z.number().int().min(1).max(20_000).optional(),
}).strict();

export type StartJobMediaInput = z.infer<typeof startJobMediaSchema>;

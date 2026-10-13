import { z } from 'zod';

// D38 request threads (Milestone 2, package P4): messageType gains 'voice',
// and a message may point at a private job_media row (mediaId) and carry the
// sender's idempotency key (clientMessageId). Video stays out of the API in
// Milestone 2 even though the database allows it. Which photo source a thread
// accepts (legacy imageUrl only in a booked thread) is decided in
// messaging.service, so these shape rules stay as they were for old apps.
export const sendMessageSchema = z.object({
  content: z.string().max(2000).default(''),
  messageType: z.enum(['text', 'image', 'voice', 'location']).default('text'),
  imageUrl: z.string().url('Invalid image URL').optional(),
  mediaId: z.string().uuid('Invalid media ID').optional(),
  clientMessageId: z.string().uuid('Invalid client message ID').optional(),
}).superRefine((message, ctx) => {
  if ((message.messageType === 'text' || message.messageType === 'location')
    && message.content.trim().length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['content'], message: 'Message cannot be empty' });
  }
  if (message.messageType === 'voice' && !message.mediaId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mediaId'], message: 'A voice message needs its recording (mediaId).' });
  }
  if (message.messageType === 'image' && !message.mediaId && !message.imageUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mediaId'], message: 'A photo message needs a photo.' });
  }
  if (message.mediaId && message.messageType !== 'image' && message.messageType !== 'voice') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['mediaId'], message: 'Only photo and voice messages carry media.' });
  }
});

export const createConversationSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID'),
  providerUserId: z.string().uuid('Invalid provider ID').optional(),
});

const page = z.coerce.number().int().min(1).max(1_000_000).default(1);

/** GET /?view=inbox. Without `view` the legacy list is served unchanged. */
export const inboxQuerySchema = z.object({
  view: z.literal('inbox'),
  state: z.enum(['open', 'read_only', 'all']).default('all'),
  bookingId: z.string().uuid('Invalid booking ID').optional(),
  page,
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * GET /:id/messages keyset paging. Used when before, after or limit is sent;
 * the legacy page/pageSize branch serves old apps unchanged.
 */
export const messagesCursorSchema = z.object({
  before: z.string().uuid('Invalid message ID').optional(),
  after: z.string().uuid('Invalid message ID').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).refine((query) => !(query.before && query.after), {
  message: 'Send before or after, not both.',
  path: ['before'],
});

export const conversationIdParamsSchema = z.object({
  id: z.string().uuid('Invalid conversation ID'),
});

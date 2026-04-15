import { z } from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message cannot be empty').max(2000),
  messageType: z.enum(['text', 'image', 'location']).default('text'),
  imageUrl: z.string().url('Invalid image URL').optional(),
});

export const createConversationSchema = z.object({
  bookingId: z.string().uuid('Invalid booking ID'),
});

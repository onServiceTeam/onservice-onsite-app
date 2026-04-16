import { z } from 'zod';

const ratingField = z.number().int().min(1).max(5);
const optionalRatingField = z.number().int().min(1).max(5).optional();

const ALLOWED_TAGS = [
  'professional', 'punctual', 'great_value', 'friendly', 'clean',
  'thorough', 'responsive', 'skilled', 'reliable', 'careful',
] as const;

export const createReviewSchema = z.object({
  bookingId: z.string().uuid('Booking ID must be a valid UUID'),
  rating: ratingField,
  qualityRating: optionalRatingField,
  punctualityRating: optionalRatingField,
  professionalismRating: optionalRatingField,
  communicationRating: optionalRatingField,
  valueRating: optionalRatingField,
  comment: z.string().max(1000).optional().refine(
    (val) => !val || val.length === 0 || val.length >= 20,
    { message: 'Comment must be at least 20 characters if provided' },
  ),
  tags: z.array(z.enum(ALLOWED_TAGS)).max(5, 'Maximum 5 tags allowed').optional(),
  privateNote: z.string().max(1000, 'Private note must be 1000 characters or less').optional(),
  imageUrls: z.array(z.string().url()).max(5, 'Maximum 5 images allowed').optional(),
});

export const providerResponseSchema = z.object({
  response: z.string().min(20, 'Response must be at least 20 characters').max(500, 'Response must be 500 characters or less'),
});

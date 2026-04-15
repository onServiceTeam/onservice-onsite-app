import { createReviewSchema, providerResponseSchema } from '../src/validators/review.validators';

describe('Review Validators', () => {
  describe('createReviewSchema', () => {
    const validReview = {
      bookingId: '550e8400-e29b-41d4-a716-446655440000',
      rating: 5,
    };

    it('should accept a valid review with only required fields', () => {
      const result = createReviewSchema.safeParse(validReview);
      expect(result.success).toBe(true);
    });

    it('should accept a valid review with all optional fields', () => {
      const result = createReviewSchema.safeParse({
        ...validReview,
        qualityRating: 4,
        punctualityRating: 5,
        professionalismRating: 5,
        communicationRating: 4,
        valueRating: 3,
        comment: 'Excellent plumbing work! Very professional and clean.',
        imageUrls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
      });
      expect(result.success).toBe(true);
    });

    it('should reject rating below 1', () => {
      const result = createReviewSchema.safeParse({ ...validReview, rating: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject rating above 5', () => {
      const result = createReviewSchema.safeParse({ ...validReview, rating: 6 });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer rating', () => {
      const result = createReviewSchema.safeParse({ ...validReview, rating: 4.5 });
      expect(result.success).toBe(false);
    });

    it('should reject subcategory rating below 1', () => {
      const result = createReviewSchema.safeParse({ ...validReview, qualityRating: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject subcategory rating above 5', () => {
      const result = createReviewSchema.safeParse({ ...validReview, punctualityRating: 6 });
      expect(result.success).toBe(false);
    });

    it('should reject comment shorter than 20 characters if provided', () => {
      const result = createReviewSchema.safeParse({ ...validReview, comment: 'Too short' });
      expect(result.success).toBe(false);
    });

    it('should accept empty comment', () => {
      const result = createReviewSchema.safeParse({ ...validReview, comment: '' });
      expect(result.success).toBe(true);
    });

    it('should reject comment over 1000 characters', () => {
      const result = createReviewSchema.safeParse({ ...validReview, comment: 'A'.repeat(1001) });
      expect(result.success).toBe(false);
    });

    it('should reject more than 5 image URLs', () => {
      const urls = Array.from({ length: 6 }, (_, i) => `https://example.com/photo${i}.jpg`);
      const result = createReviewSchema.safeParse({ ...validReview, imageUrls: urls });
      expect(result.success).toBe(false);
    });

    it('should reject invalid image URLs', () => {
      const result = createReviewSchema.safeParse({ ...validReview, imageUrls: ['not-a-url'] });
      expect(result.success).toBe(false);
    });

    it('should reject invalid booking ID format', () => {
      const result = createReviewSchema.safeParse({ ...validReview, bookingId: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });

    it('should reject missing rating', () => {
      const result = createReviewSchema.safeParse({ bookingId: validReview.bookingId });
      expect(result.success).toBe(false);
    });

    it('should reject missing booking ID', () => {
      const result = createReviewSchema.safeParse({ rating: 5 });
      expect(result.success).toBe(false);
    });
  });

  describe('providerResponseSchema', () => {
    it('should accept a valid response', () => {
      const result = providerResponseSchema.safeParse({
        response: 'Thank you for the kind review! I appreciate your trust.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject response shorter than 20 characters', () => {
      const result = providerResponseSchema.safeParse({ response: 'Thanks!' });
      expect(result.success).toBe(false);
    });

    it('should reject response over 500 characters', () => {
      const result = providerResponseSchema.safeParse({ response: 'A'.repeat(501) });
      expect(result.success).toBe(false);
    });

    it('should reject missing response', () => {
      const result = providerResponseSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

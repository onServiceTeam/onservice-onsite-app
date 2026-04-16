import { fileDisputeSchema, providerDisputeResponseSchema, resolveDisputeSchema, escalateDisputeSchema, assignDisputeSchema } from '../src/validators/dispute.validators';

describe('Dispute Validators', () => {
  describe('fileDisputeSchema', () => {
    it('should accept a valid dispute filing', () => {
      const result = fileDisputeSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'no_show',
        description: 'The provider never showed up. I waited for over an hour at the agreed location.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject description shorter than 50 chars', () => {
      const result = fileDisputeSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'incomplete',
        description: 'Too short',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid dispute type', () => {
      const result = fileDisputeSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'invalid_type',
        description: 'A valid description that is at least fifty characters long to pass validation checks.',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid evidence URLs', () => {
      const result = fileDisputeSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'damage',
        description: 'The provider damaged my kitchen counter while working on the plumbing repair job.',
        evidenceUrls: [
          { url: 'https://storage.example.com/photo1.jpg', type: 'photo', description: 'Damage to counter' },
          { url: 'https://storage.example.com/video1.mp4', type: 'video' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject more than 10 evidence files', () => {
      const evidenceUrls = Array.from({ length: 11 }, (_, i) => ({
        url: `https://storage.example.com/photo${i}.jpg`,
        type: 'photo' as const,
      }));
      const result = fileDisputeSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        type: 'damage',
        description: 'A description that is long enough to pass the fifty character minimum validation check.',
        evidenceUrls,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing bookingId', () => {
      const result = fileDisputeSchema.safeParse({
        type: 'no_show',
        description: 'A description that is long enough to pass the fifty character minimum validation check.',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid dispute types (with evidence for damage/theft)', () => {
      const evidenceRequiredTypes = new Set(['damage', 'theft']);
      const types = ['no_show', 'incomplete', 'substandard', 'damage', 'theft', 'overcharge', 'other'];
      for (const type of types) {
        const data: Record<string, unknown> = {
          bookingId: '550e8400-e29b-41d4-a716-446655440000',
          type,
          description: 'A description that is long enough to pass the fifty character minimum validation check.',
        };
        if (evidenceRequiredTypes.has(type)) {
          data.evidenceUrls = [{ url: 'https://example.com/photo.jpg', type: 'photo' }];
        }
        const result = fileDisputeSchema.safeParse(data);
        expect(result.success).toBe(true);
      }
    });

    it('should reject damage/theft disputes without evidence', () => {
      for (const type of ['damage', 'theft']) {
        const result = fileDisputeSchema.safeParse({
          bookingId: '550e8400-e29b-41d4-a716-446655440000',
          type,
          description: 'A description that is long enough to pass the fifty character minimum validation check.',
        });
        expect(result.success).toBe(false);
      }
    });
  });

  describe('providerDisputeResponseSchema', () => {
    it('should accept a valid accept response', () => {
      const result = providerDisputeResponseSchema.safeParse({
        response: 'I accept this dispute claim as the work was not completed properly.',
        action: 'accept',
      });
      expect(result.success).toBe(true);
    });

    it('should accept a valid contest response', () => {
      const result = providerDisputeResponseSchema.safeParse({
        response: 'I contest this dispute. I completed the work as agreed upon.',
        action: 'contest',
      });
      expect(result.success).toBe(true);
    });

    it('should accept a valid partial offer with amount', () => {
      const result = providerDisputeResponseSchema.safeParse({
        response: 'I offer a partial refund as the work was mostly completed.',
        action: 'partial_offer',
        partialOfferAmount: 25000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject partial_offer without amount', () => {
      const result = providerDisputeResponseSchema.safeParse({
        response: 'I offer a partial refund as the work was mostly completed.',
        action: 'partial_offer',
      });
      expect(result.success).toBe(false);
    });

    it('should reject response shorter than 20 chars', () => {
      const result = providerDisputeResponseSchema.safeParse({
        response: 'Too short',
        action: 'accept',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('resolveDisputeSchema', () => {
    it('should accept full refund resolution', () => {
      const result = resolveDisputeSchema.safeParse({
        resolutionType: 'full_refund',
        decisionNotes: 'After review, the customer claim is valid. Full refund issued.',
      });
      expect(result.success).toBe(true);
    });

    it('should accept partial refund with percent', () => {
      const result = resolveDisputeSchema.safeParse({
        resolutionType: 'partial_refund',
        refundPercent: 50,
        decisionNotes: 'Work was partially completed. 50% refund recommended.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject partial refund without percent', () => {
      const result = resolveDisputeSchema.safeParse({
        resolutionType: 'partial_refund',
        decisionNotes: 'Work was partially completed. Refund recommended.',
      });
      expect(result.success).toBe(false);
    });

    it('should reject refund percent over 100', () => {
      const result = resolveDisputeSchema.safeParse({
        resolutionType: 'partial_refund',
        refundPercent: 150,
        decisionNotes: 'Work was partially completed. Refund recommended.',
      });
      expect(result.success).toBe(false);
    });

    it('should reject decision notes shorter than 20 chars', () => {
      const result = resolveDisputeSchema.safeParse({
        resolutionType: 'no_refund',
        decisionNotes: 'No refund.',
      });
      expect(result.success).toBe(false);
    });

    it('should accept all valid resolution types', () => {
      const types = ['full_refund', 'partial_refund', 'no_refund', 'free_redo', 'refund_with_warning', 'refund_with_suspension', 'split_decision'];
      for (const resolutionType of types) {
        const needsPercent = resolutionType === 'partial_refund' || resolutionType === 'split_decision';
        const result = resolveDisputeSchema.safeParse({
          resolutionType,
          refundPercent: needsPercent ? 50 : undefined,
          decisionNotes: 'A sufficiently long decision note for this resolution type test case.',
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('escalateDisputeSchema', () => {
    it('should accept valid escalation reason', () => {
      const result = escalateDisputeSchema.safeParse({
        reason: 'This dispute requires senior review due to high amount.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject reason shorter than 10 chars', () => {
      const result = escalateDisputeSchema.safeParse({
        reason: 'Short',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('assignDisputeSchema', () => {
    it('should accept valid UUID', () => {
      const result = assignDisputeSchema.safeParse({
        assigneeId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = assignDisputeSchema.safeParse({
        assigneeId: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });
});

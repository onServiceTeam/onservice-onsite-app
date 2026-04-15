import { createTemplateSchema, updateTemplateSchema } from '../src/validators/notification-template.validators';

describe('Notification Template Validators', () => {
  describe('createTemplateSchema', () => {
    it('should accept valid template', () => {
      const result = createTemplateSchema.safeParse({
        slug: 'custom_promo',
        titleTemplate: 'Special Promo!',
        bodyTemplate: 'Get {{discount}}% off your next booking with code {{code}}.',
        type: 'promo',
        channel: 'push',
        variables: ['discount', 'code'],
      });
      expect(result.success).toBe(true);
    });

    it('should accept template with defaults', () => {
      const result = createTemplateSchema.safeParse({
        slug: 'test_template',
        titleTemplate: 'Test Title',
        bodyTemplate: 'This is a test template body text.',
        type: 'system',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.channel).toBe('in_app');
      }
    });

    it('should accept all valid types', () => {
      const types = ['booking_update', 'payment', 'dispute_update', 'tier_upgrade', 'payout', 'referral', 'suki', 'promo', 'system'];
      for (const type of types) {
        const result = createTemplateSchema.safeParse({
          slug: `test_${type}`,
          titleTemplate: 'Title',
          bodyTemplate: 'Body content that meets the minimum length.',
          type,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept all valid channels', () => {
      const channels = ['in_app', 'push', 'sms', 'email', 'all'];
      for (const channel of channels) {
        const result = createTemplateSchema.safeParse({
          slug: `test_${channel}`,
          titleTemplate: 'Title',
          bodyTemplate: 'Body content that meets the minimum length.',
          type: 'system',
          channel,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid slug format', () => {
      const result = createTemplateSchema.safeParse({
        slug: 'Invalid-Slug!',
        titleTemplate: 'Title',
        bodyTemplate: 'Body content that meets the minimum length.',
        type: 'system',
      });
      expect(result.success).toBe(false);
    });

    it('should reject slug shorter than 3 chars', () => {
      const result = createTemplateSchema.safeParse({
        slug: 'ab',
        titleTemplate: 'Title',
        bodyTemplate: 'Body content that meets the minimum length.',
        type: 'system',
      });
      expect(result.success).toBe(false);
    });

    it('should reject body shorter than 10 chars', () => {
      const result = createTemplateSchema.safeParse({
        slug: 'test_slug',
        titleTemplate: 'Title',
        bodyTemplate: 'Short',
        type: 'system',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid type', () => {
      const result = createTemplateSchema.safeParse({
        slug: 'test_slug',
        titleTemplate: 'Title',
        bodyTemplate: 'Body content that meets the minimum length.',
        type: 'invalid_type',
      });
      expect(result.success).toBe(false);
    });

    it('should reject more than 20 variables', () => {
      const result = createTemplateSchema.safeParse({
        slug: 'test_slug',
        titleTemplate: 'Title',
        bodyTemplate: 'Body content that meets the minimum length.',
        type: 'system',
        variables: Array.from({ length: 21 }, (_, i) => `var${i}`),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateTemplateSchema', () => {
    it('should accept partial update', () => {
      const result = updateTemplateSchema.safeParse({
        titleTemplate: 'Updated Title',
      });
      expect(result.success).toBe(true);
    });

    it('should accept isActive toggle', () => {
      const result = updateTemplateSchema.safeParse({
        isActive: false,
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty update (no fields)', () => {
      const result = updateTemplateSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid channel', () => {
      const result = updateTemplateSchema.safeParse({
        channel: 'telegram',
      });
      expect(result.success).toBe(false);
    });
  });
});

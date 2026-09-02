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
        reason: 'Creating reviewed promotional reference copy.',
      });
      expect(result.success).toBe(true);
    });

    it('should leave an omitted channel for the service to resolve from runtime linkage', () => {
      const result = createTemplateSchema.safeParse({
        slug: 'test_template',
        titleTemplate: 'Test Title',
        bodyTemplate: 'This is a test template body text.',
        type: 'system',
        reason: 'Creating reviewed system notification copy.',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.channel).toBeUndefined();
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
          reason: 'Creating reviewed notification template copy.',
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
          reason: 'Creating reviewed channel reference metadata.',
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
        reason: 'Updating reviewed notification title copy.',
      });
      expect(result.success).toBe(true);
    });

    it('should accept isActive toggle', () => {
      const result = updateTemplateSchema.safeParse({
        isActive: false,
        reason: 'Disabling notification copy during review.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject an update without an audit reason', () => {
      const result = updateTemplateSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject a reason-only update with no template change', () => {
      const result = updateTemplateSchema.safeParse({
        reason: 'No actual template field was changed here.',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid channel', () => {
      const result = updateTemplateSchema.safeParse({
        channel: 'telegram',
        reason: 'Testing an invalid notification channel value.',
      });
      expect(result.success).toBe(false);
    });
  });
});

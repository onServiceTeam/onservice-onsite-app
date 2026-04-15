import { suspendProviderSchema, changeProviderTierSchema } from '../src/validators/admin.validators';

describe('Admin Validators', () => {
  describe('suspendProviderSchema', () => {
    it('should accept valid reason', () => {
      const result = suspendProviderSchema.safeParse({
        reason: 'Multiple customer complaints and low rating pattern.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject reason shorter than 10 chars', () => {
      const result = suspendProviderSchema.safeParse({
        reason: 'Short',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing reason', () => {
      const result = suspendProviderSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject reason longer than 1000 chars', () => {
      const result = suspendProviderSchema.safeParse({
        reason: 'a'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });
  });

  describe('changeProviderTierSchema', () => {
    it('should accept valid tier change', () => {
      const result = changeProviderTierSchema.safeParse({
        tier: 'pro',
        reason: 'Provider has maintained excellent rating for 6 months.',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid tiers', () => {
      const tiers = ['new', 'verified', 'pro', 'elite'];
      for (const tier of tiers) {
        const result = changeProviderTierSchema.safeParse({
          tier,
          reason: 'Tier change as per policy review results.',
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid tier', () => {
      const result = changeProviderTierSchema.safeParse({
        tier: 'platinum',
        reason: 'Not a valid tier level in the system.',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing reason', () => {
      const result = changeProviderTierSchema.safeParse({
        tier: 'pro',
      });
      expect(result.success).toBe(false);
    });
  });

});

import { redeemPointsSchema } from '../src/validators/suki.validators';

describe('Suki Validators', () => {
  describe('redeemPointsSchema', () => {
    it('should accept valid redemption', () => {
      const result = redeemPointsSchema.safeParse({
        membershipId: '550e8400-e29b-41d4-a716-446655440000',
        points: 500,
      });
      expect(result.success).toBe(true);
    });

    it('should accept minimum 100 points', () => {
      const result = redeemPointsSchema.safeParse({
        membershipId: '550e8400-e29b-41d4-a716-446655440000',
        points: 100,
      });
      expect(result.success).toBe(true);
    });

    it('should reject points below 100', () => {
      const result = redeemPointsSchema.safeParse({
        membershipId: '550e8400-e29b-41d4-a716-446655440000',
        points: 50,
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero points', () => {
      const result = redeemPointsSchema.safeParse({
        membershipId: '550e8400-e29b-41d4-a716-446655440000',
        points: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative points', () => {
      const result = redeemPointsSchema.safeParse({
        membershipId: '550e8400-e29b-41d4-a716-446655440000',
        points: -100,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid membership ID', () => {
      const result = redeemPointsSchema.safeParse({
        membershipId: 'not-a-uuid',
        points: 100,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing membershipId', () => {
      const result = redeemPointsSchema.safeParse({
        points: 100,
      });
      expect(result.success).toBe(false);
    });
  });
});

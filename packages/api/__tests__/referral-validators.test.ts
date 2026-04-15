import { redeemReferralSchema } from '../src/validators/referral.validators';

describe('Referral Validators', () => {
  describe('redeemReferralSchema', () => {
    it('should accept valid referral code', () => {
      const result = redeemReferralSchema.safeParse({ code: 'ABCD1234' });
      expect(result.success).toBe(true);
    });

    it('should transform code to uppercase', () => {
      const result = redeemReferralSchema.safeParse({ code: 'abcd1234' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.code).toBe('ABCD1234');
      }
    });

    it('should reject code shorter than 4 chars', () => {
      const result = redeemReferralSchema.safeParse({ code: 'AB' });
      expect(result.success).toBe(false);
    });

    it('should reject code longer than 20 chars', () => {
      const result = redeemReferralSchema.safeParse({ code: 'A'.repeat(21) });
      expect(result.success).toBe(false);
    });

    it('should reject missing code', () => {
      const result = redeemReferralSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

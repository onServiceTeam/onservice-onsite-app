import { sendTipSchema } from '../src/validators/tip.validators';

describe('Tip Validators', () => {
  describe('sendTipSchema', () => {
    it('should accept valid tip with wallet payment', () => {
      const result = sendTipSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 5000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.paymentMethod).toBe('wallet');
      }
    });

    it('should accept tip with message and explicit method', () => {
      const result = sendTipSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 10000,
        paymentMethod: 'gcash',
        message: 'Great job, salamat po!',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid payment methods', () => {
      const methods = ['wallet', 'gcash', 'maya', 'card'];
      for (const paymentMethod of methods) {
        const result = sendTipSchema.safeParse({
          bookingId: '550e8400-e29b-41d4-a716-446655440000',
          amount: 5000,
          paymentMethod,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid booking ID', () => {
      const result = sendTipSchema.safeParse({
        bookingId: 'not-a-uuid',
        amount: 5000,
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero amount', () => {
      const result = sendTipSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 0,
      });
      expect(result.success).toBe(false);
    });

    it('should reject amount over ₱10,000', () => {
      const result = sendTipSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 1000001,
      });
      expect(result.success).toBe(false);
    });

    it('should reject message over 500 chars', () => {
      const result = sendTipSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 5000,
        message: 'a'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing bookingId', () => {
      const result = sendTipSchema.safeParse({
        amount: 5000,
      });
      expect(result.success).toBe(false);
    });
  });
});

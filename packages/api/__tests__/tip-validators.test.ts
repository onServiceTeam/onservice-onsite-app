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

    it('bug-417-tip-max: rejects amount above the hard sanity cap (10_000_000 / ₱100K)', () => {
      // The dynamic per-booking cap is enforced in tip.service.sendTip
      // via getSettingNumber('tip_max_amount_cents'). The schema
      // enforces a hard sanity backstop of 10_000_000 centavos.
      const result = sendTipSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 10_000_001,
      });
      expect(result.success).toBe(false);
    });

    it('accepts amount at the schema sanity boundary (10_000_000)', () => {
      const result = sendTipSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 10_000_000,
      });
      expect(result.success).toBe(true);
    });

    it('bug-417-tip-max: schema accepts amount above the dynamic 5K cap (service enforces dynamic)', () => {
      // The dynamic cap (₱5,000 default) is enforced server-side by
      // tip.service.sendTip via getSettingNumber. The schema deliberately
      // permits values up to the hard backstop so admins raising the
      // setting don't need a code change.
      const result = sendTipSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 600_000, // ₱6K — over the seeded 5K cap, under the hard cap
      });
      expect(result.success).toBe(true);
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

    it('bug-417-strict: rejects unknown keys (no client-side override of dynamic cap)', () => {
      const result = sendTipSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 5000,
        evilOverride: 'x',
      } as unknown);
      expect(result.success).toBe(false);
    });
  });
});

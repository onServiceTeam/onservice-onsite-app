import { requestPayoutSchema, rejectPayoutSchema } from '../src/validators/payout.validators';

describe('Payout Validators', () => {
  describe('requestPayoutSchema', () => {
    it('should accept valid GCash payout request', () => {
      const result = requestPayoutSchema.safeParse({
        amount: 50000,
        method: 'gcash',
        destinationAccount: '09171234567',
      });
      expect(result.success).toBe(true);
    });

    it('should accept valid bank payout with optional fields', () => {
      const result = requestPayoutSchema.safeParse({
        amount: 100000,
        method: 'bank_instapay',
        destinationAccount: '1234567890',
        accountName: 'Juan Dela Cruz',
        notes: 'Monthly payout',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid methods', () => {
      const methods = ['gcash', 'maya', 'bank_instapay', 'bank_pesonet'];
      for (const method of methods) {
        const result = requestPayoutSchema.safeParse({
          amount: 50000,
          method,
          destinationAccount: '09171234567',
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid method', () => {
      const result = requestPayoutSchema.safeParse({
        amount: 50000,
        method: 'paypal',
        destinationAccount: '09171234567',
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero amount', () => {
      const result = requestPayoutSchema.safeParse({
        amount: 0,
        method: 'gcash',
        destinationAccount: '09171234567',
      });
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const result = requestPayoutSchema.safeParse({
        amount: -1000,
        method: 'gcash',
        destinationAccount: '09171234567',
      });
      expect(result.success).toBe(false);
    });

    it('should reject short destination account', () => {
      const result = requestPayoutSchema.safeParse({
        amount: 50000,
        method: 'gcash',
        destinationAccount: '123',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing destination account', () => {
      const result = requestPayoutSchema.safeParse({
        amount: 50000,
        method: 'gcash',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('rejectPayoutSchema', () => {
    it('should accept valid rejection reason', () => {
      const result = rejectPayoutSchema.safeParse({
        reason: 'Account details could not be verified.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject reason shorter than 10 chars', () => {
      const result = rejectPayoutSchema.safeParse({
        reason: 'Short',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing reason', () => {
      const result = rejectPayoutSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

import { createPaymentIntentSchema, processRefundSchema } from '../src/validators/payment.validators';
import { withdrawalSchema } from '../src/validators/wallet.validators';

describe('Payment & Wallet Validators', () => {
  describe('createPaymentIntentSchema', () => {
    it('should accept valid payment intent (gcash)', () => {
      const result = createPaymentIntentSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        paymentMethod: 'gcash',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid payment methods', () => {
      const methods = ['gcash', 'maya', 'card', 'qrph', 'wallet', 'bank_transfer'];
      for (const method of methods) {
        const result = createPaymentIntentSchema.safeParse({
          bookingId: '550e8400-e29b-41d4-a716-446655440000',
          paymentMethod: method,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid payment method', () => {
      const result = createPaymentIntentSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        paymentMethod: 'bitcoin',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid booking ID', () => {
      const result = createPaymentIntentSchema.safeParse({
        bookingId: 'not-uuid',
        paymentMethod: 'gcash',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      expect(createPaymentIntentSchema.safeParse({}).success).toBe(false);
      expect(createPaymentIntentSchema.safeParse({ bookingId: '550e8400-e29b-41d4-a716-446655440000' }).success).toBe(false);
    });
  });

  describe('processRefundSchema', () => {
    it('should accept valid refund request', () => {
      const result = processRefundSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 50000,
        reason: 'Customer requested cancellation',
      });
      expect(result.success).toBe(true);
    });

    it('should reject zero or negative amount', () => {
      expect(processRefundSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 0,
        reason: 'Test',
      }).success).toBe(false);

      expect(processRefundSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: -100,
        reason: 'Test',
      }).success).toBe(false);
    });

    it('should reject empty reason', () => {
      const result = processRefundSchema.safeParse({
        bookingId: '550e8400-e29b-41d4-a716-446655440000',
        amount: 50000,
        reason: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('withdrawalSchema', () => {
    it('should accept valid withdrawal', () => {
      const result = withdrawalSchema.safeParse({
        amount: 100000,
        method: 'gcash',
        destinationAccount: '09171234567',
      });
      expect(result.success).toBe(true);
    });

    it('should accept all valid methods', () => {
      const methods = ['gcash', 'maya', 'bank_instapay', 'bank_pesonet'];
      for (const method of methods) {
        const result = withdrawalSchema.safeParse({
          amount: 100000,
          method,
          destinationAccount: '09171234567',
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid method', () => {
      const result = withdrawalSchema.safeParse({
        amount: 100000,
        method: 'cash',
        destinationAccount: '09171234567',
      });
      expect(result.success).toBe(false);
    });

    it('should reject zero or negative amount', () => {
      const result = withdrawalSchema.safeParse({
        amount: 0,
        method: 'gcash',
        destinationAccount: '09171234567',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty destination account', () => {
      const result = withdrawalSchema.safeParse({
        amount: 100000,
        method: 'gcash',
        destinationAccount: '',
      });
      expect(result.success).toBe(false);
    });
  });
});

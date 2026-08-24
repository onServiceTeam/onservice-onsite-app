import {
  sendOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  updateProfileSchema,
} from '../src/validators/auth.validators';

describe('Auth Validators', () => {
  describe('sendOtpSchema', () => {
    it('should accept valid +63 phone number', () => {
      const result = sendOtpSchema.safeParse({ phone: '+639171234567' });
      expect(result.success).toBe(true);
    });

    it('should reject phone without +63 prefix', () => {
      const result = sendOtpSchema.safeParse({ phone: '09171234567' });
      expect(result.success).toBe(false);
    });

    it('should reject phone with wrong country code', () => {
      const result = sendOtpSchema.safeParse({ phone: '+19171234567' });
      expect(result.success).toBe(false);
    });

    it('should reject phone with too few digits', () => {
      const result = sendOtpSchema.safeParse({ phone: '+6391712345' });
      expect(result.success).toBe(false);
    });

    it('should reject phone with too many digits', () => {
      const result = sendOtpSchema.safeParse({ phone: '+6391712345678' });
      expect(result.success).toBe(false);
    });

    it('should reject empty phone', () => {
      const result = sendOtpSchema.safeParse({ phone: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing phone field', () => {
      const result = sendOtpSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('verifyOtpSchema', () => {
    it('should accept valid phone and 6-digit code', () => {
      const result = verifyOtpSchema.safeParse({ phone: '+639171234567', code: '123456' });
      expect(result.success).toBe(true);
    });

    it('should reject code with fewer than 4 digits', () => {
      const result = verifyOtpSchema.safeParse({ phone: '+639171234567', code: '123' });
      expect(result.success).toBe(false);
    });

    it('should reject code with more than 8 digits', () => {
      const result = verifyOtpSchema.safeParse({ phone: '+639171234567', code: '123456789' });
      expect(result.success).toBe(false);
    });

    it('should reject non-numeric code', () => {
      const result = verifyOtpSchema.safeParse({ phone: '+639171234567', code: 'abcdef' });
      expect(result.success).toBe(false);
    });

    it('should reject missing code', () => {
      const result = verifyOtpSchema.safeParse({ phone: '+639171234567' });
      expect(result.success).toBe(false);
    });
  });

  describe('refreshTokenSchema', () => {
    it('should accept valid refresh token', () => {
      const result = refreshTokenSchema.safeParse({ refreshToken: 'some-jwt-token-string' });
      expect(result.success).toBe(true);
    });

    it('should reject empty refresh token', () => {
      const result = refreshTokenSchema.safeParse({ refreshToken: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing refresh token', () => {
      const result = refreshTokenSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('updateProfileSchema', () => {
    it('should accept valid name update', () => {
      const result = updateProfileSchema.safeParse({ firstName: 'Maria', lastName: 'Santos' });
      expect(result.success).toBe(true);
    });

    it('should accept email update only', () => {
      const result = updateProfileSchema.safeParse({ email: 'maria@test.ph' });
      expect(result.success).toBe(true);
    });

    it('should accept empty body (all optional)', () => {
      const result = updateProfileSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = updateProfileSchema.safeParse({ email: 'not-an-email' });
      expect(result.success).toBe(false);
    });

    it('should reject empty first name', () => {
      const result = updateProfileSchema.safeParse({ firstName: '' });
      expect(result.success).toBe(false);
    });
  });
});

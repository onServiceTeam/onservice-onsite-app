import { createAddressSchema, updateAddressSchema } from '../src/validators/address.validators';

describe('Address Validators', () => {
  describe('createAddressSchema', () => {
    const validAddress = {
      label: 'Home' as const,
      fullAddress: 'Unit 1234, Tower A, BGC, Taguig City',
      barangay: 'Fort Bonifacio',
      city: 'Taguig City',
      province: 'Metro Manila',
      region: 'NCR',
      zipCode: '1634',
      latitude: 14.5547,
      longitude: 121.0503,
      isDefault: true,
      notes: 'Near gate 2',
    };

    it('should accept a valid Philippine address', () => {
      const result = createAddressSchema.safeParse(validAddress);
      expect(result.success).toBe(true);
    });

    it('should accept valid label values', () => {
      for (const label of ['Home', 'Work', 'Other'] as const) {
        const result = createAddressSchema.safeParse({ ...validAddress, label });
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid label', () => {
      const result = createAddressSchema.safeParse({ ...validAddress, label: 'School' });
      expect(result.success).toBe(false);
    });

    it('should require fullAddress', () => {
      const { fullAddress: _fullAddress, ...rest } = validAddress;
      const result = createAddressSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should require barangay', () => {
      const { barangay: _barangay, ...rest } = validAddress;
      const result = createAddressSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should require city', () => {
      const { city: _city, ...rest } = validAddress;
      const result = createAddressSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should require province', () => {
      const { province: _province, ...rest } = validAddress;
      const result = createAddressSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should allow optional fields to be omitted', () => {
      const minimal = {
        label: 'Home' as const,
        fullAddress: 'Some address in the Philippines',
        barangay: 'Barangay 1',
        city: 'Manila',
        province: 'Metro Manila',
      };
      const result = createAddressSchema.safeParse(minimal);
      expect(result.success).toBe(true);
    });

    it('should validate latitude is within Philippine range (4-22)', () => {
      const result = createAddressSchema.safeParse({ ...validAddress, latitude: 3 });
      expect(result.success).toBe(false);
    });

    it('should validate longitude is within Philippine range (116-128)', () => {
      const result = createAddressSchema.safeParse({ ...validAddress, longitude: 115 });
      expect(result.success).toBe(false);
    });

    it('should accept coordinates at Zamboanga edge', () => {
      const result = createAddressSchema.safeParse({
        ...validAddress,
        latitude: 6.91,
        longitude: 122.07,
      });
      expect(result.success).toBe(true);
    });

    it('should accept coordinates at Batanes edge', () => {
      const result = createAddressSchema.safeParse({
        ...validAddress,
        latitude: 20.45,
        longitude: 121.97,
      });
      expect(result.success).toBe(true);
    });

    it('should reject fullAddress shorter than 5 chars', () => {
      const result = createAddressSchema.safeParse({ ...validAddress, fullAddress: 'abc' });
      expect(result.success).toBe(false);
    });
  });

  describe('updateAddressSchema', () => {
    it('should allow partial updates', () => {
      const result = updateAddressSchema.safeParse({ city: 'Makati City' });
      expect(result.success).toBe(true);
    });

    it('should allow empty object (no fields to update)', () => {
      const result = updateAddressSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should still validate field constraints on partial', () => {
      const result = updateAddressSchema.safeParse({ latitude: 0 });
      expect(result.success).toBe(false);
    });
  });
});

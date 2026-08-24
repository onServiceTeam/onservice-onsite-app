import { updateProfileSchema, addServiceSchema, setScheduleSchema } from '../src/validators/provider.validators';

describe('Provider Validators', () => {
  describe('updateProfileSchema', () => {
    it('should accept valid profile update', () => {
      const result = updateProfileSchema.safeParse({
        bio: 'Experienced plumber with 10 years of service',
        yearsExperience: 10,
        serviceRadiusKm: 25,
      });
      expect(result.success).toBe(true);
    });

    it('should accept single field update', () => {
      const result = updateProfileSchema.safeParse({ isAvailable: true });
      expect(result.success).toBe(true);
    });

    it('should reject empty update', () => {
      const result = updateProfileSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject serviceRadiusKm below 1', () => {
      const result = updateProfileSchema.safeParse({ serviceRadiusKm: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject serviceRadiusKm above 50', () => {
      const result = updateProfileSchema.safeParse({ serviceRadiusKm: 51 });
      expect(result.success).toBe(false);
    });

    it('should enforce Philippine latitude bounds', () => {
      expect(updateProfileSchema.safeParse({ latitude: 3 }).success).toBe(false);
      expect(updateProfileSchema.safeParse({ latitude: 23 }).success).toBe(false);
      expect(updateProfileSchema.safeParse({ latitude: 14.5 }).success).toBe(true);
    });

    it('should enforce Philippine longitude bounds', () => {
      expect(updateProfileSchema.safeParse({ longitude: 115 }).success).toBe(false);
      expect(updateProfileSchema.safeParse({ longitude: 129 }).success).toBe(false);
      expect(updateProfileSchema.safeParse({ longitude: 121 }).success).toBe(true);
    });

    it('should reject negative years experience', () => {
      const result = updateProfileSchema.safeParse({ yearsExperience: -1 });
      expect(result.success).toBe(false);
    });
  });

  describe('addServiceSchema', () => {
    it('should accept valid service addition', () => {
      const result = addServiceSchema.safeParse({
        subcategoryId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('strips the retired provider base-price field', () => {
      const result = addServiceSchema.safeParse({
        subcategoryId: '550e8400-e29b-41d4-a716-446655440000',
        basePrice: 50000,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          subcategoryId: '550e8400-e29b-41d4-a716-446655440000',
        });
      }
    });

    it('should reject invalid subcategory ID', () => {
      const result = addServiceSchema.safeParse({ subcategoryId: 'not-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('setScheduleSchema', () => {
    it('should accept valid schedule', () => {
      const result = setScheduleSchema.safeParse({
        schedule: [
          { dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
          { dayOfWeek: 2, startTime: '08:00', endTime: '17:00', isAvailable: true },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty schedule', () => {
      const result = setScheduleSchema.safeParse({ schedule: [] });
      expect(result.success).toBe(false);
    });

    it('should reject dayOfWeek outside 0-6', () => {
      expect(setScheduleSchema.safeParse({
        schedule: [{ dayOfWeek: -1, startTime: '08:00', endTime: '17:00', isAvailable: true }],
      }).success).toBe(false);

      expect(setScheduleSchema.safeParse({
        schedule: [{ dayOfWeek: 7, startTime: '08:00', endTime: '17:00', isAvailable: true }],
      }).success).toBe(false);
    });

    it('should reject invalid time format', () => {
      const result = setScheduleSchema.safeParse({
        schedule: [{ dayOfWeek: 1, startTime: '8am', endTime: '5pm', isAvailable: true }],
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid time format HH:MM', () => {
      const result = setScheduleSchema.safeParse({
        schedule: [{ dayOfWeek: 0, startTime: '00:00', endTime: '23:59', isAvailable: false }],
      });
      expect(result.success).toBe(true);
    });

    it('should reject more than 7 schedule slots', () => {
      const slots = Array.from({ length: 8 }, (_, i) => ({
        dayOfWeek: i % 7,
        startTime: '08:00',
        endTime: '17:00',
        isAvailable: true,
      }));
      const result = setScheduleSchema.safeParse({ schedule: slots });
      expect(result.success).toBe(false);
    });

    it('should reject duplicate dayOfWeek values', () => {
      const result = setScheduleSchema.safeParse({
        schedule: [
          { dayOfWeek: 1, startTime: '08:00', endTime: '12:00', isAvailable: true },
          { dayOfWeek: 1, startTime: '13:00', endTime: '17:00', isAvailable: true },
        ],
      });
      expect(result.success).toBe(false);
    });
  });
});

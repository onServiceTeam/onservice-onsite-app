import { availabilityOverrideSchema } from '../src/validators/provider.validators';

it('Bug UX-087 — an available date override requires a complete valid custom-hours window', () => {
  expect(availabilityOverrideSchema.safeParse({
    overrideDate: '2099-08-31',
    isAvailable: true,
    startTime: '08:00',
    endTime: '17:00',
  }).success).toBe(true);

  expect(availabilityOverrideSchema.safeParse({
    overrideDate: '2099-08-31',
    isAvailable: true,
  }).success).toBe(false);

  expect(availabilityOverrideSchema.safeParse({
    overrideDate: '2099-08-31',
    isAvailable: true,
    startTime: '8:00',
    endTime: '17:00',
  }).success).toBe(false);
});

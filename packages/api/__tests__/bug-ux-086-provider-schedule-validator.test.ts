import { setScheduleSchema } from '../src/validators/provider.validators';

it('Bug UX-086 — weekly schedule validation rejects impossible and reversed available-hour ranges', () => {
  expect(setScheduleSchema.safeParse({
    schedule: [{ dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true }],
  }).success).toBe(true);

  expect(setScheduleSchema.safeParse({
    schedule: [{ dayOfWeek: 1, startTime: '25:00', endTime: '26:00', isAvailable: true }],
  }).success).toBe(false);

  expect(setScheduleSchema.safeParse({
    schedule: [{ dayOfWeek: 1, startTime: '17:00', endTime: '08:00', isAvailable: true }],
  }).success).toBe(false);
});

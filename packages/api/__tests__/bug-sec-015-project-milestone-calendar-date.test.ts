import {
  addMilestoneSchema,
  updateMilestoneSchema,
} from '../src/validators/project.validators';

it('Bug SEC-015 — project milestone writes reject impossible calendar dates before PostgreSQL parsing', () => {
  expect(addMilestoneSchema.safeParse({
    title: 'Impossible deadline',
    targetDate: '2026-02-31',
  }).success).toBe(false);
  expect(updateMilestoneSchema.safeParse({
    targetDate: '2026-04-31',
  }).success).toBe(false);
  expect(addMilestoneSchema.safeParse({
    title: 'Real deadline',
    targetDate: '2028-02-29',
  }).success).toBe(true);
});

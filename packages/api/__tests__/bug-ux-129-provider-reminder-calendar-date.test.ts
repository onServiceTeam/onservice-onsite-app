import { addReminderSchema } from '../src/validators/provider-crm.validators';

it('Bug UX-129 — provider reminder rejects impossible calendar dates before PostgreSQL receives them', () => {
  expect(addReminderSchema.safeParse({ title: 'Follow up', dueDate: '2026-02-31' }).success).toBe(false);
  expect(addReminderSchema.safeParse({ title: 'Follow up', dueDate: '2028-02-29' }).success).toBe(true);
});

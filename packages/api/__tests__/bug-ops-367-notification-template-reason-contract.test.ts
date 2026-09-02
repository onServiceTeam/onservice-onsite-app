import {
  createTemplateSchema,
  deleteTemplateSchema,
  updateTemplateSchema,
} from '../src/validators/notification-template.validators';

it('Bug OPS-367 — every notification-template lifecycle mutation requires an operator reason', () => {
  expect(createTemplateSchema.safeParse({
    slug: 'reference_notice',
    titleTemplate: 'Reference notice',
    bodyTemplate: 'This is reviewed reference notification copy.',
    type: 'system',
    channel: 'in_app',
  }).success).toBe(false);
  expect(updateTemplateSchema.safeParse({ isActive: false }).success).toBe(false);
  expect(deleteTemplateSchema.safeParse({}).success).toBe(false);

  const reason = 'Recording why this customer-facing copy must change.';
  expect(createTemplateSchema.safeParse({
    slug: 'reference_notice',
    titleTemplate: 'Reference notice',
    bodyTemplate: 'This is reviewed reference notification copy.',
    type: 'system',
    channel: 'in_app',
    reason,
  }).success).toBe(true);
  expect(updateTemplateSchema.safeParse({ isActive: false, reason }).success).toBe(true);
  expect(deleteTemplateSchema.safeParse({ reason }).success).toBe(true);
});

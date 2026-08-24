import { createTemplateSchema } from '../src/validators/provider-crm.validators';

function item(index: number): Record<string, unknown> {
  return {
    description: `Line item ${index}`,
    quantity: 1,
    unit: 'job',
    unitPrice: 100,
    itemType: 'labor',
  };
}

it('Bug UX-299 — saved templates cannot exceed the 20 line items accepted by quote submission', () => {
  const accepted = createTemplateSchema.safeParse({
    name: 'Twenty-item template',
    items: Array.from({ length: 20 }, (_, index) => item(index)),
  });
  const rejected = createTemplateSchema.safeParse({
    name: 'Twenty-one-item template',
    items: Array.from({ length: 21 }, (_, index) => item(index)),
  });

  expect(accepted.success).toBe(true);
  expect(rejected.success).toBe(false);
  if (!rejected.success) {
    expect(rejected.error.issues.some((issue) => issue.path.join('.') === 'items')).toBe(true);
  }
});

import { createTemplateSchema } from '../src/validators/provider-crm.validators';

it('Bug UX-294 — quote templates reject zero-price items that the quote submission contract cannot accept', () => {
  const result = createTemplateSchema.safeParse({
    name: 'Broken zero-price template',
    items: [{
      description: 'Labor',
      quantity: 1,
      unit: 'job',
      unitPrice: 0,
      itemType: 'labor',
    }],
  });

  expect(result.success).toBe(false);
  if (!result.success) {
    expect(result.error.issues.some((issue) => issue.path.join('.') === 'items.0.unitPrice')).toBe(true);
  }
});

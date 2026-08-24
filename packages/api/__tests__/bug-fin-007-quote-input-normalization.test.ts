import { submitQuoteSchema } from '../src/validators/booking.validators';

it('Bug FIN-007 — quote validation rejects whitespace scope and line labels before money is stored', () => {
  const base = {
    quotedPrice: 10_000,
    description: 'Replace the damaged drain safely.',
    lineItems: [{ description: 'Labor', quantity: 1, unit: 'job', unitPrice: 10_000 }],
  };

  expect(submitQuoteSchema.safeParse({ ...base, description: '          ' }).success).toBe(false);
  expect(submitQuoteSchema.safeParse({ ...base, lineItems: [{ ...base.lineItems[0], description: '   ' }] }).success).toBe(false);
  expect(submitQuoteSchema.safeParse({ ...base, lineItems: [{ ...base.lineItems[0], unit: '   ' }] }).success).toBe(false);
  expect(submitQuoteSchema.safeParse({ ...base, unexpectedMoneyField: 999_999 }).success).toBe(false);

  const valid = submitQuoteSchema.safeParse({
    ...base,
    description: '  Replace the damaged drain safely.  ',
  });
  expect(valid.success).toBe(true);
  if (valid.success) expect(valid.data.description).toBe('Replace the damaged drain safely.');
});

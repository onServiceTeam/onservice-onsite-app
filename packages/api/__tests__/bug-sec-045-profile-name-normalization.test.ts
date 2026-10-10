import { updateProfileSchema } from '../src/validators/auth.validators';

it('Bug SEC-045 — the canonical profile contract trims names and rejects whitespace-only identity values', () => {
  const normalized = updateProfileSchema.safeParse({
    firstName: '  J  ',
    lastName: '  de la Cruz  ',
  });
  const whitespaceOnly = updateProfileSchema.safeParse({
    firstName: '   ',
    lastName: '\t\r\n',
  });

  expect(normalized.success).toBe(true);
  if (normalized.success) {
    expect(normalized.data).toEqual({ firstName: 'J', lastName: 'de la Cruz' });
  }
  expect(whitespaceOnly.success).toBe(false);
});

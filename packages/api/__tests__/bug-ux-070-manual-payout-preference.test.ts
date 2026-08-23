import { updatePayoutPreferencesSchema } from '../src/validators/wallet.validators';

it('Bug UX-070 — payout preferences reject unsupported automatic cadences', () => {
  expect(updatePayoutPreferencesSchema.safeParse({ frequency: 'manual' }).success).toBe(true);
  expect(updatePayoutPreferencesSchema.safeParse({ frequency: 'daily' }).success).toBe(false);
  expect(updatePayoutPreferencesSchema.safeParse({ frequency: 'weekly' }).success).toBe(false);
  expect(updatePayoutPreferencesSchema.safeParse({ frequency: 'biweekly' }).success).toBe(false);
  expect(updatePayoutPreferencesSchema.safeParse({ frequency: 'monthly' }).success).toBe(false);
});

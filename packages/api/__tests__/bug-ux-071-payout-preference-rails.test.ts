import { updatePayoutPreferencesSchema } from '../src/validators/wallet.validators';

it('Bug UX-071 — saved payout methods use the same four rails as manual withdrawal', () => {
  for (const preferredMethod of ['gcash', 'maya', 'bank_instapay', 'bank_pesonet']) {
    expect(updatePayoutPreferencesSchema.safeParse({ preferredMethod }).success).toBe(true);
  }
  expect(updatePayoutPreferencesSchema.safeParse({ preferredMethod: 'bank_transfer' }).success).toBe(false);
});

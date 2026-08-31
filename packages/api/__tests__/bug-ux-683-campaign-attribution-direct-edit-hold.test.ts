import { updateMarketingCampaignSchema } from '../src/validators/promo.validators';

it('Bug UX-683 — campaign updates reject direct attribution counter overwrites', () => {
  const result = updateMarketingCampaignSchema.safeParse({
    attributedSignups: 10_000,
    attributedFirstBookings: 8_000,
    attributedRevenueCentavos: 999_999_999,
  });
  expect(result.success).toBe(false);
});

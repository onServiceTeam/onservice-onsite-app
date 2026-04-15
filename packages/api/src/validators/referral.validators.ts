import { z } from 'zod';

export const redeemReferralSchema = z.object({
  code: z.string().min(4, 'Referral code must be at least 4 characters').max(20).transform(v => v.toUpperCase()),
});

import { z } from 'zod';

export const redeemPointsSchema = z.object({
  membershipId: z.string().uuid('Membership ID must be a valid UUID'),
  points: z.number().int().positive('Points must be positive').min(100, 'Minimum redemption is 100 points'),
});

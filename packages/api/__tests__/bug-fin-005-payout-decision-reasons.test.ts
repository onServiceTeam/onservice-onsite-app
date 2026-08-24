import {
  approvePayoutSchema,
  clearAmlReviewSchema,
  completePayoutSchema,
  rejectPayoutSchema,
} from '../src/validators/payout.validators';

it('Bug FIN-005 — every privileged payout decision rejects a missing or non-specific audit reason', () => {
  expect(approvePayoutSchema.safeParse({}).success).toBe(false);
  expect(approvePayoutSchema.safeParse({ reason: 'ok' }).success).toBe(false);
  expect(rejectPayoutSchema.safeParse({ reason: 'no' }).success).toBe(false);
  expect(clearAmlReviewSchema.safeParse({ reason: 'checked' }).success).toBe(false);
  expect(completePayoutSchema.safeParse({ paymongoTransferId: 'transfer-1' }).success).toBe(false);
  expect(rejectPayoutSchema.safeParse({ reason: '             ' }).success).toBe(false);

  expect(approvePayoutSchema.safeParse({ reason: 'Identity and balance were verified.' }).success).toBe(true);
  expect(clearAmlReviewSchema.safeParse({ reason: 'Source of funds review was completed.' }).success).toBe(true);
  expect(rejectPayoutSchema.safeParse({ reason: 'Destination ownership could not be verified.' }).success).toBe(true);
  expect(completePayoutSchema.safeParse({ reason: 'External transfer receipt was verified.' }).success).toBe(true);
});

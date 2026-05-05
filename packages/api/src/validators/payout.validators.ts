import { z } from 'zod';

// MED-M08 fix — sane upper bound on payout amount.
// Service-layer enforces amount <= wallet.available_balance AND
// AML-review threshold gate (MED-N77). This validator is a
// defense-in-depth backstop. ₱10,000,000 (1B centavos) is well above
// any realistic single payout (and triggers AML review at the
// service layer regardless).
const PAYOUT_MAX_CENTAVOS = 1_000_000_000;

export const requestPayoutSchema = z.object({
  amount: z
    .number()
    .int()
    .positive('Amount must be positive')
    .max(PAYOUT_MAX_CENTAVOS, `Payout amount cannot exceed ${PAYOUT_MAX_CENTAVOS} centavos.`),
  method: z.enum(['gcash', 'maya', 'bank_instapay', 'bank_pesonet']),
  destinationAccount: z.string().min(5, 'Account number is required').max(255),
  accountName: z.string().min(2).max(255).optional(),
  notes: z.string().max(500).optional(),
});

export const rejectPayoutSchema = z.object({
  reason: z.string().min(10, 'Reason must be at least 10 characters').max(1000),
});

// BUG-PHASE188-01 fix — pre-fix POST /payouts/:id/complete read
// req.body.paymongoTransferId without validation. The value flowed
// straight into the paymongo_transfer_id column. Same server-cap
// shape as Phase 152-168 + Phase 179-181. PayMongo transfer IDs are
// short alphanumeric strings; cap at 100 + require string type.
export const completePayoutSchema = z.object({
  paymongoTransferId: z.string().max(100).optional(),
});

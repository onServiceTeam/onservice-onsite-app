import { z } from 'zod';

// MED-M08 fix — sane upper bound on wallet withdrawal amount.
// Service-layer (MED-N166) delegates to payoutService.requestPayout
// which enforces wallet.available_balance and AML-review threshold;
// this validator is the defense-in-depth backstop.
const WITHDRAWAL_MAX_CENTAVOS = 1_000_000_000;

export const withdrawalSchema = z.object({
  amount: z
    .number()
    .int()
    .positive('Withdrawal amount must be positive')
    .max(WITHDRAWAL_MAX_CENTAVOS, `Withdrawal amount cannot exceed ${WITHDRAWAL_MAX_CENTAVOS} centavos.`),
  method: z.enum(['gcash', 'maya', 'bank_instapay', 'bank_pesonet']),
  destinationAccount: z.string().min(1, 'Destination account is required').max(255),
});

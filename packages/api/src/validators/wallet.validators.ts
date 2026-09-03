import { z } from 'zod';
import { requestPayoutSchema } from './payout.validators';

// MED-N166 / OPS-299: the wallet route is a facade over requestPayout, so it
// must use the same request contract. The former duplicate omitted accountName
// and notes; validation therefore stripped both before the route delegated.
// Sharing the schema also keeps amount, rail, and destination limits aligned.
export const withdrawalSchema = requestPayoutSchema;

// BUG-PHASE199-01 fix — pre-fix PUT /wallet/payout-preferences had
// no Zod validator. The route read req.body.destinationAccount and
// passed it through to providers.payout_destination_account
// (VARCHAR(255), per migration 002). A provider posting a 1000-char
// string got a 5xx string-data-right-truncation error rather than a
// clean 400. Same defense-in-depth pattern as Phase 188 (complete-
// payout schema).
export const updatePayoutPreferencesSchema = z.object({
  // UX-070 — launch is manual-withdrawal only. The previous enum accepted
  // automatic cadences even though no scheduler or payout worker consumed
  // them. Keep `manual` so a provider can explicitly retire a legacy saved
  // cadence, but reject new automatic-payout promises at the API boundary.
  frequency: z.literal('manual').optional(),
  // UX-071 — match the rails accepted by requestPayout/withdraw. The old
  // `bank_transfer` value was not routable, while the settings screen's real
  // InstaPay and PESONet values were rejected here.
  preferredMethod: z.enum(['gcash', 'maya', 'bank_instapay', 'bank_pesonet']).optional(),
  destinationAccount: z.string().max(255).optional(),
}).strict();

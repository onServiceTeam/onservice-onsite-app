import { createAppError } from '../middleware/error.middleware';

export const EXTERNAL_PAYMENT_HOLD_MESSAGE =
  'Card, GCash, Maya, QR Ph, bank transfer, and wallet top-ups are temporarily unavailable while the payment authorization flow is being corrected (E14). No payment was created.';

/**
 * E14 containment. The current PayMongo implementation creates a Payment
 * Intent and then constructs a hosted checkout URL that PayMongo does not
 * provide. Fail before any database or gateway write. The environment key is
 * retained as a deployment contract and must remain 0; setting it to 1 cannot
 * reactivate known-broken payment code. An approved replacement must remove
 * this hold in a reviewed money-path change.
 *
 * Tests bypass the deployment switch so existing route behavior tests can run
 * without mutating process-wide environment state. Dedicated hold tests pass a
 * non-test environment explicitly.
 */
export function assertExternalPaymentAuthorizationEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'test') return;
  throw createAppError(EXTERNAL_PAYMENT_HOLD_MESSAGE, 503);
}

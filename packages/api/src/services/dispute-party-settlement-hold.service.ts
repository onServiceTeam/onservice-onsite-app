import { createAppError } from '../middleware/error.middleware';

export const DISPUTE_PARTY_SETTLEMENT_HOLD_MESSAGE =
  'Direct full-refund acceptance and partial-refund offers are temporarily unavailable while dispute settlement concurrency and escrow timing are being corrected (E18/E24). Contesting a claim and admin review remain available.';

/**
 * E24 containment. Fail before any dispute, booking, wallet, or gateway write
 * on the direct provider-accept, provider partial-offer and customer
 * accept-offer paths. Tests bypass the deployment hold so the underlying
 * implementation stays regression-tested.
 *
 * The original reasons were that these paths could update a dispute before
 * their escrow movement was durably complete, and that concurrent requests
 * were not serialized by a dispute-row lock. MC-03 (candidate, not deployed)
 * addresses both: the provider accept and the customer accept-offer lock the
 * dispute, then the booking, and refund inside the same transaction; the
 * provider partial offer is a single guarded dispute write that moves no
 * money. Other E24 items remain open (see the E24 record), including the
 * accept-offer path's missing notice and audit row and its post-commit
 * release. The hold stays until Ken approves lifting it through a reviewed
 * code change.
 */
export function assertDisputePartySettlementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'test') return;
  throw createAppError(DISPUTE_PARTY_SETTLEMENT_HOLD_MESSAGE, 503);
}

import { createAppError } from '../middleware/error.middleware';

export const DISPUTE_PARTY_SETTLEMENT_HOLD_MESSAGE =
  'Direct full-refund acceptance and partial-refund offers are temporarily unavailable while dispute settlement concurrency and escrow timing are being corrected (E18/E24). Contesting a claim and admin review remain available.';

/**
 * E24 containment. The direct provider-accept and customer partial-offer paths
 * can update a dispute before their escrow movement is durably complete, and
 * concurrent requests are not serialized by a dispute-row lock. Fail before
 * any dispute, booking, wallet, or gateway write. Tests bypass the deployment
 * hold so the underlying implementation stays regression-tested until the
 * reviewed replacement lands.
 */
export function assertDisputePartySettlementEnabled(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === 'test') return;
  throw createAppError(DISPUTE_PARTY_SETTLEMENT_HOLD_MESSAGE, 503);
}

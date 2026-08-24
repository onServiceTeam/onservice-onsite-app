import {
  assertDisputePartySettlementEnabled,
  DISPUTE_PARTY_SETTLEMENT_HOLD_MESSAGE,
} from '../src/services/dispute-party-settlement-hold.service';

it('Bug OPS-229 — deployed direct participant dispute settlement fails before money or case writes', () => {
  expect(() => assertDisputePartySettlementEnabled({ NODE_ENV: 'staging' } as NodeJS.ProcessEnv))
    .toThrow(expect.objectContaining({
      statusCode: 503,
      message: DISPUTE_PARTY_SETTLEMENT_HOLD_MESSAGE,
    }));
  expect(() => assertDisputePartySettlementEnabled({ NODE_ENV: 'production', DISPUTE_PARTY_SETTLEMENT_ENABLED: '1' } as NodeJS.ProcessEnv))
    .toThrow(expect.objectContaining({ statusCode: 503 }));
});

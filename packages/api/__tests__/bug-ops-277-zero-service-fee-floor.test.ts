import { calculateServiceFeeFromTerms } from '../src/services/booking-financial-terms.service';

it('Bug OPS-277 — a zero snapshotted service-fee rate is not replaced by the minimum fee floor', () => {
  expect(calculateServiceFeeFromTerms(100000, {
    serviceFeeRateBasisPoints: 0,
    serviceFeeMinCentavos: 5000,
    serviceFeeMaxCentavos: 50000,
  })).toBe(0);
});

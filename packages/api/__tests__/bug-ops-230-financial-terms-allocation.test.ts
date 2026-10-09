import { computeFinalAllocation } from '../src/services/booking-financial-terms.service';

it('Bug OPS-230 — a fixed financial allocation conserves every authorized centavo', () => {
  expect(computeFinalAllocation({
    servicePriceCentavos: 100_000,
    serviceFeeAmountCentavos: 10_000,
    commissionRateBasisPoints: 1_500,
    guaranteeFundRateBasisPoints: 150,
  })).toEqual({
    commissionAmountCentavos: 15_000,
    guaranteeFundAmountCentavos: 150,
    providerReceivesCentavos: 85_000,
    platformRetainsCentavos: 24_850,
    totalAmountCentavos: 110_000,
  });
});

import { calculateCancellationFromTerms } from '../src/services/booking-financial-terms.service';

it('Bug OPS-232 — cancellation uses the booking snapshot instead of a later platform setting', () => {
  const result = calculateCancellationFromTerms(
    100_000,
    {
      cancellationPolicy: {
        over24HoursPercent: 100,
        twoTo24HoursPercent: 95,
        oneToTwoHoursPercent: 85,
        thirtyMinutesToOneHourPercent: 75,
        underThirtyMinutesPercent: 65,
        providerArrivedPercent: 40,
        customerNoShowPercent: 0,
      },
    },
    1.5,
    false,
  );

  expect(result).toEqual({
    customerRefundPercent: 0.85,
    providerCompensationPercent: 0.15,
    customerRefundAmount: 85_000,
    providerCompensationAmount: 15_000,
  });
});

import {
  type BookingFinancialTerms,
  prorateFinalTerms,
} from '../src/services/booking-financial-terms.service';

const terms: BookingFinancialTerms = {
  id: 'terms-1',
  bookingId: 'booking-1',
  version: 1,
  supersedesTermsId: null,
  termsState: 'final',
  pricingVersion: 'booking-v1',
  providerId: 'provider-1',
  providerTier: 'new',
  commissionSource: 'tier_default',
  commissionRateVersionId: 'rate-1',
  commissionRateBasisPoints: 1500,
  servicePriceCentavos: 100_000,
  serviceFeeRateBasisPoints: 1000,
  serviceFeeMinCentavos: 2500,
  serviceFeeMaxCentavos: 50_000,
  serviceFeeAmountCentavos: 10_000,
  guaranteeFundRateBasisPoints: 150,
  guaranteeFundAmountCentavos: 150,
  commissionAmountCentavos: 15_000,
  providerReceivesCentavos: 85_000,
  platformRetainsCentavos: 24_850,
  totalAmountCentavos: 110_000,
  currency: 'PHP',
  cancellationPolicy: {
    over24HoursPercent: 100,
    twoTo24HoursPercent: 100,
    oneToTwoHoursPercent: 90,
    thirtyMinutesToOneHourPercent: 80,
    underThirtyMinutesPercent: 70,
    providerArrivedPercent: 50,
    customerNoShowPercent: 0,
  },
  settingSources: {},
  fixedByEvent: 'wallet_payment_authorized',
  sourceEventId: 'intent-1',
  fixedAt: new Date('2026-09-01T00:00:00.000Z'),
  createdBy: 'customer-1',
  metadata: {},
};

it('Bug OPS-231 — a partial dispute release prorates the snapshot without reading live rates', () => {
  expect(prorateFinalTerms(terms, 55_000)).toEqual({
    servicePriceCentavos: 50_000,
    serviceFeeAmountCentavos: 5_000,
    commissionAmountCentavos: 7_500,
    guaranteeFundAmountCentavos: 75,
    providerReceivesCentavos: 42_500,
    platformRetainsCentavos: 12_425,
    totalAmountCentavos: 55_000,
  });
});

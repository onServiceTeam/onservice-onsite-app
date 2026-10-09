const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import {
  LEGACY_REVIEW_CONFIRMATION,
  reviewLegacyBookingFinancialTerms,
} from '../src/services/booking-financial-terms.service';

it('Bug OPS-265 — legacy review rejects fee settings that do not reproduce the customer charge', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', provider_id: null, category_id: 'category-1', subcategory_id: null,
      status: 'paid', escrow_status: 'held', service_price: '100000', service_fee: '10000',
      total_amount: '110000',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await expect(reviewLegacyBookingFinancialTerms('booking-1', {
    serviceFeeRateBasisPoints: 500,
    serviceFeeMinCentavos: 0,
    serviceFeeMaxCentavos: 50000,
    guaranteeFundRateBasisPoints: 150,
    cancellationPolicy: {
      over24HoursPercent: 100, twoTo24HoursPercent: 80, oneToTwoHoursPercent: 50,
      thirtyMinutesToOneHourPercent: 25, underThirtyMinutesPercent: 0,
      providerArrivedPercent: 0, customerNoShowPercent: 0,
    },
    evidenceNote: 'Reviewed against the historical payment and pricing ledger entries.',
    evidenceReferences: ['payment-intent: legacy-one'],
    confirmation: LEGACY_REVIEW_CONFIRMATION,
  }, 'actor-1')).rejects.toMatchObject({ statusCode: 409 });

  expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO booking_financial_terms'))).toBe(false);
  expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO admin_actions'))).toBe(false);
});

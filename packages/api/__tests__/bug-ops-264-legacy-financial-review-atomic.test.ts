const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import {
  LEGACY_REVIEW_CONFIRMATION,
  reviewLegacyBookingFinancialTerms,
} from '../src/services/booking-financial-terms.service';

it('Bug OPS-264 — a reviewed legacy booking records booking-scoped rate evidence, immutable terms, and the admin action atomically', async () => {
  const bookingId = '00000000-0000-4000-8000-000000000264';
  const providerId = '00000000-0000-4000-8000-000000000002';
  const actorId = '00000000-0000-4000-8000-000000000001';
  const fixedAt = new Date('2026-09-01T04:00:00.000Z');
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sqlValue: unknown, paramsValue?: unknown[]) => {
    const sql = String(sqlValue);
    const params = paramsValue ?? [];
    calls.push({ sql, params });
    if (sql.includes('FROM bookings') && sql.includes('FOR UPDATE')) {
      return { rows: [{
        id: bookingId, provider_id: providerId, category_id: 'category-1', subcategory_id: null,
        status: 'paid', escrow_status: 'held', service_price: '100000', service_fee: '10000',
        total_amount: '110000',
      }], rowCount: 1 };
    }
    if (sql.includes('FROM booking_financial_terms') && sql.includes('ORDER BY version')) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('clock_timestamp() AS now')) return { rows: [{ now: fixedAt }], rowCount: 1 };
    if (sql.includes('SELECT tier FROM providers')) return { rows: [{ tier: 'verified' }], rowCount: 1 };
    if (sql.includes('INSERT INTO commission_rate_versions')) {
      return { rows: [{ id: 'rate-evidence-1' }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO booking_financial_terms')) {
      return { rows: [{
        id: 'terms-1', booking_id: bookingId, version: 1, supersedes_terms_id: null,
        terms_state: 'final', pricing_version: 'booking-v1', provider_id: providerId,
        provider_tier: 'new', commission_source: 'legacy_review',
        commission_rate_version_id: 'rate-evidence-1', commission_rate_basis_points: 1200,
        service_price_centavos: '100000', service_fee_rate_basis_points: 1000,
        service_fee_min_centavos: '0', service_fee_max_centavos: '50000',
        service_fee_amount_centavos: '10000', guarantee_fund_rate_basis_points: 150,
        guarantee_fund_amount_centavos: '150', commission_amount_centavos: '12000',
        provider_receives_centavos: '88000', platform_retains_centavos: '21850',
        total_amount_centavos: '110000', currency: 'PHP',
        cancellation_policy: {
          over24HoursPercent: 100, twoTo24HoursPercent: 80, oneToTwoHoursPercent: 50,
          thirtyMinutesToOneHourPercent: 25, underThirtyMinutesPercent: 0,
          providerArrivedPercent: 0, customerNoShowPercent: 0,
        },
        setting_sources: {}, fixed_by_event: 'legacy_reviewed_backfill',
        source_event_id: bookingId, fixed_at: fixedAt, created_by: actorId, metadata: {},
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO admin_actions')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const result = await reviewLegacyBookingFinancialTerms(bookingId, {
    providerTier: 'new',
    commissionRateBasisPoints: 1200,
    serviceFeeRateBasisPoints: 1000,
    serviceFeeMinCentavos: 0,
    serviceFeeMaxCentavos: 50000,
    guaranteeFundRateBasisPoints: 150,
    cancellationPolicy: {
      over24HoursPercent: 100, twoTo24HoursPercent: 80, oneToTwoHoursPercent: 50,
      thirtyMinutesToOneHourPercent: 25, underThirtyMinutesPercent: 0,
      providerArrivedPercent: 0, customerNoShowPercent: 0,
    },
    evidenceNote: 'Verified against the original payment record and signed provider agreement.',
    evidenceReferences: ['payment-intent: pi_legacy_264', 'provider-agreement: archive-264'],
    confirmation: LEGACY_REVIEW_CONFIRMATION,
  }, actorId);

  expect(result).toMatchObject({ termsState: 'final', providerReceivesCentavos: 88000 });
  expect(transactionMock).toHaveBeenCalledTimes(1);
  const rateCall = calls.find((call) => call.sql.includes('INSERT INTO commission_rate_versions'));
  expect(rateCall?.sql).toContain("'booking'");
  expect(rateCall?.params).toEqual(expect.arrayContaining([bookingId, 1200, actorId]));
  expect(calls.some((call) => call.sql.includes("'legacy_financial_terms_reviewed'"))).toBe(true);
});

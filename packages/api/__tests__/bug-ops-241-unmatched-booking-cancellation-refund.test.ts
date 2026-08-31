const getLatestTermsInTransactionMock = jest.fn();

jest.mock('../src/services/booking-financial-terms.service', () => {
  const actual = jest.requireActual('../src/services/booking-financial-terms.service');
  return {
    ...actual,
    getLatestTermsInTransaction: (...args: unknown[]) => getLatestTermsInTransactionMock(...args),
  };
});

jest.mock('../src/services/wallet.service', () => ({
  lockWalletsForUpdate: jest.fn(),
}));

import { handleCancellationInTransaction } from '../src/services/escrow.service';

it('Bug OPS-241 — an unmatched paid booking can cancel against provisional terms for a full refund', async () => {
  getLatestTermsInTransactionMock.mockResolvedValueOnce({
    id: 'terms-1',
    bookingId: 'booking-1',
    version: 1,
    termsState: 'provisional',
    providerId: null,
    servicePriceCentavos: 100_000,
    serviceFeeAmountCentavos: 10_000,
    totalAmountCentavos: 110_000,
    cancellationPolicy: {
      over24HoursPercent: 100,
      twoTo24HoursPercent: 95,
      oneToTwoHoursPercent: 85,
      thirtyMinutesToOneHourPercent: 75,
      underThirtyMinutesPercent: 65,
      providerArrivedPercent: 40,
      customerNoShowPercent: 0,
    },
  });

  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('FROM bookings WHERE id = $1 FOR UPDATE')) {
        return {
          rows: [{
            id: 'booking-1',
            customer_id: 'customer-1',
            provider_id: null,
            service_price: '100000',
            service_fee: '10000',
            total_amount: '110000',
            status: 'paid',
            escrow_status: 'held',
            scheduled_at: new Date('2026-09-02T10:00:00+08:00'),
          }],
          rowCount: 1,
        };
      }
      if (sql.includes('type = ANY')) {
        return { rows: [{ id: 'escrow-wallet', type: 'platform_escrow' }], rowCount: 1 };
      }
      if (sql.includes('SELECT pending_balance FROM wallets')) {
        return { rows: [{ pending_balance: '110000' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
  };

  const result = await handleCancellationInTransaction(
    client,
    'booking-1',
    0.1,
    false,
  );

  expect(result).toEqual({
    customerRefundPercent: 1,
    providerCompensationPercent: 0,
    customerRefundAmount: 100_000,
    providerCompensationAmount: 0,
  });
  expect(calls).toEqual(expect.arrayContaining([
    expect.objectContaining({
      sql: expect.stringContaining('UPDATE bookings SET escrow_status'),
      params: ['refunded', 'booking-1'],
    }),
    expect.objectContaining({
      sql: expect.stringContaining("'refund'"),
      params: ['escrow-wallet', 'booking-1', -110_000, expect.any(String)],
    }),
  ]));
});

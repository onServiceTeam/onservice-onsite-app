const getPlatformWalletMock = jest.fn();
const getUserWalletMock = jest.fn();
const getUserWalletInTransactionMock = jest.fn();

jest.mock('../src/services/wallet.service', () => ({
  getPlatformWallet: (...args: unknown[]) => getPlatformWalletMock(...args),
  getUserWallet: (...args: unknown[]) => getUserWalletMock(...args),
  getUserWalletInTransaction: (...args: unknown[]) => getUserWalletInTransactionMock(...args),
  lockWalletsForUpdate: jest.fn(),
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendAmendedTermsInTransaction: jest.fn(),
  getLatestTermsInTransaction: jest.fn(async () => ({
    id: 'terms-2', bookingId: 'booking-1', version: 2, termsState: 'final', providerId: 'provider-1',
    servicePriceCentavos: 50000, serviceFeeAmountCentavos: 5000, totalAmountCentavos: 55000,
    commissionRateBasisPoints: 1500, commissionAmountCentavos: 7500,
    guaranteeFundAmountCentavos: 75, providerReceivesCentavos: 42500,
    platformRetainsCentavos: 12425, serviceFeeRateBasisPoints: 1000,
  })),
}));
jest.mock('../src/services/or.service', () => ({ issueOR: jest.fn() }));

import { settleHourlyAndReleaseInTransaction } from '../src/services/escrow.service';

it('Bug OPS-249 — hourly settlement resolves every refund wallet through the caller transaction', async () => {
  getPlatformWalletMock.mockRejectedValue(new Error('out-of-transaction platform lookup'));
  getUserWalletMock.mockRejectedValue(new Error('out-of-transaction user lookup'));
  getUserWalletInTransactionMock.mockImplementation(async (_client: unknown, userId: string, type: string) => ({
    id: `wallet-${type}-${userId}`,
    type,
  }));

  let bookingRead = 0;
  const client = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('b.is_hourly')) {
        return { rows: [{
          is_hourly: true, estimated_hours: '2',
          work_started_at: new Date('2026-09-01T00:00:00.000Z'),
          work_completed_at: new Date('2026-09-01T01:00:00.000Z'),
          service_price: '100000', service_fee: '10000', total_amount: '110000',
          customer_id: 'customer-1', min_billable_minutes: 60, billing_increment_minutes: 30,
        }], rowCount: 1 };
      }
      if (sql.includes('FROM bookings b WHERE b.id = $1 FOR UPDATE')) {
        bookingRead += 1;
        return { rows: [{
          id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1',
          service_price: '50000', service_fee: '5000', total_amount: '55000',
          status: 'confirmed', escrow_status: 'held', scheduled_at: new Date(), provider_suspended_during_booking_at: null,
        }], rowCount: 1 };
      }
      if (sql.includes('SELECT user_id FROM providers')) {
        return { rows: [{ user_id: 'provider-user-1' }], rowCount: 1 };
      }
      if (sql.includes('type = ANY')) {
        const requested = params[0] as string[];
        return {
          rows: requested.map((type) => ({ id: `wallet-${type}`, type })),
          rowCount: requested.length,
        };
      }
      if (sql.includes('SELECT pending_balance')) {
        return { rows: [{ pending_balance: '1000000' }], rowCount: 1 };
      }
      if (sql.includes('COALESCE(SUM(amount), 0)')) {
        return { rows: [{ remaining: '55000' }], rowCount: 1 };
      }
      if (sql.includes('UPDATE bookings SET escrow_status')) {
        return { rows: [{ id: 'booking-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
  };

  await expect(settleHourlyAndReleaseInTransaction(client, 'booking-1')).resolves.toMatchObject({
    servicePrice: 50000,
    providerReceives: 42500,
  });
  expect(bookingRead).toBe(1);
  expect(getPlatformWalletMock).not.toHaveBeenCalled();
  expect(getUserWalletMock).not.toHaveBeenCalled();
  expect(getUserWalletInTransactionMock).toHaveBeenCalledWith(client, 'customer-1', 'customer');
  expect(getUserWalletInTransactionMock).toHaveBeenCalledWith(client, 'provider-user-1', 'provider');
});

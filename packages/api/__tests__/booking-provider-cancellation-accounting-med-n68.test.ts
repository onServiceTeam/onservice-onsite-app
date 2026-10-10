const mockDbQuery = jest.fn();
const mockTransaction = jest.fn();
const mockTransactionQuery = jest.fn();
const mockProcessSlotAvailability = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/slot-waitlist.service', () => ({
  processSlotAvailability: (...args: unknown[]) => mockProcessSlotAvailability(...args),
}));
jest.mock('../src/services/socket.service', () => ({
  ADMIN_EVENTS: { BOOKING_STATUS_CHANGED: 'booking:status_changed' },
  emitAdminEvent: jest.fn(),
}));

import { transitionBookingStatus } from '../src/services/booking.service';
import * as socketService from '../src/services/socket.service';

const lockedBooking = {
  id: 'booking-med-n68',
  customer_id: 'customer-med-n68',
  provider_id: 'provider-med-n68',
  category_id: 'category-med-n68',
  subcategory_id: null,
  booking_type: 'fixed_price',
  status: 'matched',
  escrow_status: 'pending',
  service_price: 100_000,
  service_fee: 10_000,
  total_amount: 110_000,
  description: 'Provider cancellation accounting test',
  address: 'Cebu City',
  barangay: 'Lahug',
  city: 'Cebu City',
  province: 'Cebu',
  latitude: null,
  longitude: null,
  scheduled_at: new Date('2026-09-02T00:30:00.000Z'),
  completed_at: null,
  confirmed_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  payment_method: null,
  payment_intent_id: null,
  surge_multiplier: '1',
  surge_amount: 0,
  pricing_rule_id: null,
  rebooked_from_id: null,
  suki_discount: 0,
  business_account_id: null,
  contract_id: null,
  created_at: new Date('2026-09-01T00:00:00.000Z'),
  updated_at: new Date('2026-09-01T00:00:00.000Z'),
};

it('MED-N68 - provider cancellation count is updated on the booking transaction and its failure aborts that transaction', async () => {
  const updatedBooking = {
    ...lockedBooking,
    status: 'cancelled_by_provider',
    cancelled_at: new Date('2026-09-01T01:00:00.000Z'),
    cancellation_reason: 'Provider vehicle breakdown',
  };
  // OPS-555: the actor guard resolves the assigned provider on the booking
  // transaction client (step 2), so the shared pool is never used here.
  const providerOwner = { rows: [{ user_id: 'provider-user-med-n68' }], rowCount: 1 };
  mockProcessSlotAvailability.mockResolvedValue(undefined);
  mockTransactionQuery
    .mockResolvedValueOnce({ rows: [lockedBooking], rowCount: 1 })
    .mockResolvedValueOnce(providerOwner)
    .mockResolvedValueOnce({ rows: [updatedBooking], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    // S1-7 (OPS-557): open offers close in the same transaction.
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });
  let committed = false;
  mockTransaction.mockImplementationOnce(async (
    callback: (client: { query: typeof mockTransactionQuery }) => Promise<unknown>,
  ) => {
    const result = await callback({ query: mockTransactionQuery });
    committed = true;
    return result;
  });

  const result = await transitionBookingStatus(
    'booking-med-n68',
    'provider-user-med-n68',
    'provider',
    'cancelled_by_provider',
    'Provider vehicle breakdown',
  );

  expect(result.status).toBe('cancelled_by_provider');
  expect(committed).toBe(true);
  const providerUpdate = mockTransactionQuery.mock.calls.find(
    ([sql]) => /UPDATE providers/.test(sql as string),
  );
  expect(providerUpdate).toBeDefined();
  expect(providerUpdate![0]).toMatch(/cancellations_last_30d = \([\s\S]*SELECT COUNT\(\*\) FROM bookings/);
  expect(providerUpdate![0]).not.toMatch(/INTERVAL '30 days'[\s\S]*\+\s*1/);
  expect(providerUpdate![1]).toEqual(['provider-med-n68']);
  expect(mockTransactionQuery.mock.calls[1]![0]).toMatch(/SELECT user_id FROM providers WHERE id = \$1/);
  // S1-7: the offers UPDATE is the last step on the same client.
  expect(mockTransactionQuery.mock.calls).toHaveLength(5);
  expect(mockTransactionQuery.mock.calls[4]![0]).toMatch(/UPDATE booking_offers[\s\S]*status='cancelled'[\s\S]*status='pending'/);
  expect(mockTransactionQuery.mock.calls[4]![1]).toEqual(['booking-med-n68']);
  expect(mockDbQuery).not.toHaveBeenCalled();
  // S1-5: the committed cancellation is announced once, after the commit.
  expect(socketService.emitAdminEvent).toHaveBeenCalledTimes(1);
  expect(mockProcessSlotAvailability).toHaveBeenCalledTimes(1);

  (socketService.emitAdminEvent as jest.Mock).mockClear();
  mockProcessSlotAvailability.mockClear();
  mockTransactionQuery.mockReset();
  mockTransactionQuery
    .mockResolvedValueOnce({ rows: [lockedBooking], rowCount: 1 })
    .mockResolvedValueOnce(providerOwner)
    .mockResolvedValueOnce({ rows: [updatedBooking], rowCount: 1 })
    .mockRejectedValueOnce(new Error('provider cancellation counter unavailable'));
  let failedTransactionCommitted = false;
  mockTransaction.mockImplementationOnce(async (
    callback: (client: { query: typeof mockTransactionQuery }) => Promise<unknown>,
  ) => {
    const secondResult = await callback({ query: mockTransactionQuery });
    failedTransactionCommitted = true;
    return secondResult;
  });

  await expect(transitionBookingStatus(
    'booking-med-n68',
    'provider-user-med-n68',
    'provider',
    'cancelled_by_provider',
    'Provider vehicle breakdown',
  )).rejects.toThrow('provider cancellation counter unavailable');
  expect(failedTransactionCommitted).toBe(false);
  // The counter failure aborts before the offers step.
  expect(mockTransactionQuery.mock.calls.some(([sql]) => /booking_offers/.test(sql as string))).toBe(false);
  // S1-5: a cancellation that rolled back is never announced.
  expect(socketService.emitAdminEvent).not.toHaveBeenCalled();
  expect(mockProcessSlotAvailability).not.toHaveBeenCalled();
});

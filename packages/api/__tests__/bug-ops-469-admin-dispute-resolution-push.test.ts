const transactionMock = jest.fn();
const resolveHelperMock = jest.fn();
const deliverStoredNotificationPushMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: (callback: unknown) => transactionMock(callback),
  },
}));
jest.mock('../src/services/dispute.service', () => ({
  assertDisputeResolutionAvailable: jest.fn(),
  resolveDisputeInTransaction: (...args: unknown[]) => resolveHelperMock(...args),
}));
jest.mock('../src/services/notification.service', () => ({
  deliverStoredNotificationPush: (...args: unknown[]) => deliverStoredNotificationPushMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrow: jest.fn().mockResolvedValue(undefined),
  releasePartialEscrow: jest.fn(),
  releaseEscrow: jest.fn(),
}));
jest.mock('../src/services/gateway-retry.service', () => ({ enqueueRetry: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { adminResolveDispute } from '../src/services/dispute-admin.service';

it('Bug OPS-469 — an Admin dispute decision sends each durable participant row through push delivery', async () => {
  const pushRequests = [
    {
      notificationId: 'notification-customer',
      userId: 'customer-1',
      type: 'dispute_update' as const,
      title: 'Dispute Decision Recorded',
      body: 'A decision was recorded for your dispute.',
      data: { disputeId: 'dispute-1', bookingId: 'booking-1' },
    },
    {
      notificationId: 'notification-provider',
      userId: 'provider-user-1',
      type: 'dispute_update' as const,
      title: 'Dispute Decision Recorded',
      body: 'A decision was recorded for a dispute on your booking.',
      data: { disputeId: 'dispute-1', bookingId: 'booking-1' },
    },
  ];
  resolveHelperMock.mockResolvedValueOnce({
    dispute: {},
    refundAmount: 100000,
    refundPercent: 100,
    bookingId: 'booking-1',
    bookingTotalAmount: 100000,
    providerId: 'provider-1',
    pushRequests,
  });
  deliverStoredNotificationPushMock.mockResolvedValue(undefined);
  transactionMock.mockImplementationOnce(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) =>
    callback({
      query: jest.fn().mockResolvedValue({ rows: [{ id: 'audit-1' }], rowCount: 1 }),
    }),
  );

  await adminResolveDispute(
    'dispute-1',
    { resolutionType: 'full_refund', decisionNotes: 'The evidence supports a full customer refund.' },
    'admin-1',
  );

  expect(deliverStoredNotificationPushMock).toHaveBeenCalledTimes(2);
  expect(deliverStoredNotificationPushMock).toHaveBeenNthCalledWith(1, pushRequests[0]);
  expect(deliverStoredNotificationPushMock).toHaveBeenNthCalledWith(2, pushRequests[1]);
});

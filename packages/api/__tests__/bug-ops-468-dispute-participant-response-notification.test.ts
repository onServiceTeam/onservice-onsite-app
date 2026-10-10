const queryMock = jest.fn();
const transactionMock = jest.fn();
const deliverStoredNotificationPushMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: unknown) => transactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrow: jest.fn().mockResolvedValue(undefined),
  // MC-03: the accept refund runs inside the transaction, then only the
  // payment-record step runs after commit.
  refundFromEscrowInTransaction: jest.fn().mockResolvedValue({
    remainingEscrowCentavos: 0, paymentMethod: 'wallet', customerWalletCredited: true,
  }),
  processEscrowRefundPaymentStep: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/socket.service', () => ({
  emitAdminEvent: jest.fn(),
  ADMIN_EVENTS: { DISPUTE_UPDATED: 'dispute:updated' },
}));
jest.mock('../src/services/settings.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({ enqueueRetry: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({
  deliverStoredNotificationPush: (...args: unknown[]) => deliverStoredNotificationPushMock(...args),
}));

import { addProviderResponse } from '../src/services/dispute.service';

it('Bug OPS-468 — every provider dispute response gives the customer a durable inbox and push handoff', async () => {
  const cases = [
    {
      action: 'accept' as const,
      response: 'I accept the dispute and the full refund.',
      status: 'resolved',
      title: 'Provider Accepted Your Dispute',
      body: 'The provider accepted your dispute. A full refund is being processed. Open the dispute and booking payment history for status.',
      data: { disputeStatus: 'resolved', resolution: 'full_refund' },
    },
    {
      action: 'contest' as const,
      response: 'I contest this dispute and have evidence to share.',
      status: 'under_review',
      title: 'Provider Responded to Dispute',
      body: 'The provider contested your dispute. The case is now in the onService support review queue.',
      data: { disputeStatus: 'under_review' },
    },
    {
      action: 'partial_offer' as const,
      response: 'I can offer a partial refund for the disputed work.',
      status: 'open',
      title: 'Provider Offered a Partial Refund',
      body: 'The provider offered a partial refund. Open the dispute to review the offer and decide whether to accept it.',
      data: { disputeStatus: 'open', resolution: 'partial_refund_offer' },
    },
  ];

  for (const testCase of cases) {
    queryMock.mockReset();
    transactionMock.mockReset();
    deliverStoredNotificationPushMock.mockReset();
    deliverStoredNotificationPushMock.mockResolvedValue(undefined);

    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 'dispute-1', booking_id: 'booking-1', status: 'open', provider_response: null }] })
      .mockResolvedValueOnce({ rows: [{ id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1', total_amount: '100000' }] })
      .mockResolvedValueOnce({ rows: [{ user_id: 'provider-user-1' }] });

    const updated = { id: 'dispute-1', booking_id: 'booking-1', status: testCase.status };
    transactionMock.mockImplementationOnce(async (callback: (client: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<unknown>) => {
      const client = {
        query: jest.fn(async (sql: string) => {
          if (sql.includes('INSERT INTO notifications')) return { rows: [{ id: `notification-${testCase.action}` }], rowCount: 1 };
          if (sql.includes('SELECT * FROM disputes')) return { rows: [updated], rowCount: 1 };
          return { rows: [], rowCount: 1 };
        }),
      };
      return callback(client);
    });

    await addProviderResponse(
      'dispute-1',
      'provider-user-1',
      testCase.response,
      testCase.action,
      testCase.action === 'partial_offer' ? 50000 : undefined,
    );

    expect(deliverStoredNotificationPushMock).toHaveBeenCalledWith(expect.objectContaining({
      notificationId: `notification-${testCase.action}`,
      userId: 'customer-1',
      type: 'dispute_update',
      title: testCase.title,
      body: testCase.body,
      data: expect.objectContaining({
        disputeId: 'dispute-1',
        bookingId: 'booking-1',
        ...testCase.data,
      }),
    }));
  }
});

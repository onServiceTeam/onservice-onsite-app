const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const refundInTransactionMock = jest.fn();
const legacyRefundMock = jest.fn();
const paymentStepMock = jest.fn();
const emitAdminEventMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrowInTransaction: (...args: unknown[]) => refundInTransactionMock(...args),
  refundFromEscrow: (...args: unknown[]) => legacyRefundMock(...args),
  processEscrowRefundPaymentStep: (...args: unknown[]) => paymentStepMock(...args),
}));
jest.mock('../src/services/socket.service', () => ({
  ADMIN_EVENTS: { DISPUTE_FILED: 'dispute:filed' },
  emitAdminEvent: (...args: unknown[]) => emitAdminEventMock(...args),
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: jest.fn(async () => 30),
}));
jest.mock('../src/services/gateway-retry.service', () => ({ enqueueRetry: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({
  deliverStoredNotificationPush: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { fileDispute } from '../src/services/dispute.service';

interface AutoResolutionState {
  bookingStatus: string;
  escrowStatus: string;
  disputeExists: boolean;
  disputeStatus: string | null;
  refundMoved: boolean;
}

it('MED-N19 - a failed automatic no-show refund rolls back the dispute and booking resolution together', async () => {
  const scheduledAt = new Date(Date.now() - 3 * 60 * 1000);
  const completedAt = new Date(Date.now() - 60 * 1000);
  const state: AutoResolutionState = {
    bookingStatus: 'completed_by_provider',
    escrowStatus: 'held',
    disputeExists: false,
    disputeStatus: null,
    refundMoved: false,
  };
  let failRefund = false;
  let activeTransactionClient: { query: jest.Mock } | null = null;

  const disputeRow = () => ({
    id: 'dispute-med-n19',
    booking_id: 'booking-med-n19',
    filed_by: 'customer-med-n19',
    type: 'no_show',
    description: 'The provider marked this job complete without doing the scheduled work.',
    status: state.disputeStatus ?? 'open',
    tier: 1,
    assigned_to: null,
    resolution_type: state.disputeStatus === 'resolved' ? 'full_refund' : null,
    refund_amount: state.disputeStatus === 'resolved' ? '12000' : '0',
    refund_percent: state.disputeStatus === 'resolved' ? '100' : null,
    decision_notes: null,
    internal_notes: null,
    provider_response: null,
    provider_responded_at: null,
    auto_resolved: state.disputeStatus === 'resolved',
    resolved_at: state.disputeStatus === 'resolved' ? new Date() : null,
    resolved_by: null,
    created_at: new Date(),
    updated_at: new Date(),
  });

  dbQueryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM bookings WHERE id')) {
      return {
        rows: [{
          id: 'booking-med-n19',
          customer_id: 'customer-med-n19',
          provider_id: 'provider-med-n19',
          status: state.bookingStatus,
          escrow_status: state.escrowStatus,
          total_amount: '12000',
          scheduled_at: scheduledAt,
          completed_at: completedAt,
          confirmed_at: null,
        }],
        rowCount: 1,
      };
    }
    if (sql.includes('COUNT(*)::text as count')) {
      return { rows: [{ count: state.disputeExists ? '1' : '0' }], rowCount: 1 };
    }
    throw new Error(`Unexpected outer query: ${sql}`);
  });

  dbTransactionMock.mockImplementation(async (
    callback: (client: { query: jest.Mock }) => Promise<unknown>,
  ) => {
    const snapshot = { ...state };
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('INSERT INTO disputes')) {
          state.disputeExists = true;
          state.disputeStatus = 'open';
          return { rows: [disputeRow()], rowCount: 1 };
        }
        if (sql.includes("status = 'disputed'")) {
          state.bookingStatus = 'disputed';
          state.escrowStatus = 'held';
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('SELECT scheduled_at, completed_at')) {
          return { rows: [{ scheduled_at: scheduledAt, completed_at: completedAt }], rowCount: 1 };
        }
        if (sql.includes('UPDATE disputes SET')) {
          state.disputeStatus = 'resolved';
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("status = 'resolved', escrow_status = 'refunded'")) {
          state.bookingStatus = 'resolved';
          state.escrowStatus = 'refunded';
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('SELECT * FROM disputes')) {
          return { rows: [disputeRow()], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO notifications')) {
          return { rows: [{ id: 'notification-med-n19' }], rowCount: 1 };
        }
        if (sql.includes('SELECT user_id FROM providers')) {
          return { rows: [{ user_id: 'provider-user-med-n19' }], rowCount: 1 };
        }
        throw new Error(`Unexpected transaction query: ${sql}`);
      }),
    };
    activeTransactionClient = client;
    try {
      return await callback(client);
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    }
  });

  refundInTransactionMock.mockImplementation(async (client: unknown) => {
    expect(client).toBe(activeTransactionClient);
    state.refundMoved = true;
    if (failRefund) throw new Error('simulated refund ledger failure');
    return { remainingEscrowCentavos: 0, paymentMethod: 'gcash', customerWalletCredited: false };
  });
  // MC-03's post-commit payment-record step; pinned in
  // dispute-auto-refund-payment-step.test.ts.
  paymentStepMock.mockResolvedValue(undefined);

  const input = {
    type: 'no_show' as const,
    description: 'The provider marked this job complete without doing the scheduled work.',
  };
  const resolved = await fileDispute('booking-med-n19', 'customer-med-n19', input);

  expect(resolved.status).toBe('resolved');
  expect(state).toEqual({
    bookingStatus: 'resolved',
    escrowStatus: 'refunded',
    disputeExists: true,
    disputeStatus: 'resolved',
    refundMoved: true,
  });
  expect(refundInTransactionMock).toHaveBeenCalledWith(
    expect.objectContaining({ query: expect.any(Function) }),
    'booking-med-n19',
    12000,
    'Auto-resolved dispute refund',
  );
  expect(legacyRefundMock).not.toHaveBeenCalled();

  Object.assign(state, {
    bookingStatus: 'completed_by_provider',
    escrowStatus: 'held',
    disputeExists: false,
    disputeStatus: null,
    refundMoved: false,
  });
  failRefund = true;
  emitAdminEventMock.mockClear();

  await expect(
    fileDispute('booking-med-n19', 'customer-med-n19', input),
  ).rejects.toThrow('simulated refund ledger failure');
  expect(state).toEqual({
    bookingStatus: 'completed_by_provider',
    escrowStatus: 'held',
    disputeExists: false,
    disputeStatus: null,
    refundMoved: false,
  });
  expect(emitAdminEventMock).not.toHaveBeenCalled();
  expect(legacyRefundMock).not.toHaveBeenCalled();
});

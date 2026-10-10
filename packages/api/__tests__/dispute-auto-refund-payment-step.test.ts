// MC-03 supporting check (FIN-016 is the real-database bug test). When a
// no-show dispute resolves itself at filing, the escrow refund commits inside
// the filing transaction; after commit the payment-record step runs once, with
// the dispute id, and last: after the admin event and the participant pushes,
// so a slow payment provider cannot hold back the notices. A filing that rolls
// back runs no payment-record step.

const queryMock = jest.fn();
const transactionMock = jest.fn();
const pushMock = jest.fn();
const refundMock = jest.fn();
const paymentStepMock = jest.fn();
const emitMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: {
  query: (...args: unknown[]) => queryMock(...args),
  transaction: (...args: unknown[]) => transactionMock(...args),
} }));
jest.mock('../src/services/notification.service', () => ({
  deliverStoredNotificationPush: (...args: unknown[]) => pushMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({
  refundFromEscrowInTransaction: (...args: unknown[]) => refundMock(...args),
  processEscrowRefundPaymentStep: (...args: unknown[]) => paymentStepMock(...args),
}));
jest.mock('../src/services/gateway-retry.service', () => ({ enqueueRetry: jest.fn() }));
jest.mock('../src/services/settings.service', () => ({ getSettingInteger: jest.fn(async () => 30) }));
jest.mock('../src/services/socket.service', () => ({
  emitAdminEvent: (...args: unknown[]) => emitMock(...args),
  ADMIN_EVENTS: { DISPUTE_FILED: 'dispute:filed' },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { fileDispute } from '../src/services/dispute.service';

const booking = {
  id: 'booking-auto', customer_id: 'customer-auto', provider_id: 'provider-auto',
  status: 'completed_by_provider', escrow_status: 'held', total_amount: '12000',
  scheduled_at: new Date(Date.now() - 3 * 60_000),
  completed_at: new Date(Date.now() - 60_000), confirmed_at: null,
};

function primeFiling(events: string[], refundFails: boolean) {
  let disputeStatus = '';
  const disputeRow = () => ({
    id: 'dispute-auto', booking_id: booking.id, filed_by: booking.customer_id,
    type: 'no_show', status: disputeStatus,
  });
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM bookings')) return { rows: [booking] };
    if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
    throw new Error(`Unexpected outer query: ${sql}`);
  });
  const client = { query: jest.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('INSERT INTO disputes')) { disputeStatus = 'open'; return { rows: [disputeRow()], rowCount: 1 }; }
    if (sql.includes('UPDATE bookings')) return { rows: [], rowCount: 1 };
    if (sql.includes('SELECT scheduled_at')) return { rows: [booking] };
    if (sql.includes('UPDATE disputes')) { disputeStatus = 'resolved'; return { rows: [], rowCount: 1 }; }
    if (sql.includes('SELECT * FROM disputes')) return { rows: [disputeRow()] };
    if (sql.includes('SELECT user_id FROM providers')) return { rows: [{ user_id: 'provider-user-auto' }] };
    if (sql.includes('INSERT INTO notifications')) return { rows: [{ id: `notification-${params[0] as string}` }], rowCount: 1 };
    throw new Error(`Unexpected transaction query: ${sql}`);
  }) };
  transactionMock.mockImplementation(async (callback: (arg: typeof client) => Promise<unknown>) => {
    const result = await callback(client);
    events.push('commit');
    return result;
  });
  refundMock.mockImplementation(async () => {
    events.push('refund');
    if (refundFails) throw new Error('refund failed');
    return { remainingEscrowCentavos: 0, paymentMethod: 'wallet', customerWalletCredited: true };
  });
  emitMock.mockImplementation(() => { events.push('admin-event'); });
  pushMock.mockImplementation(async ({ userId }: { userId: string }) => { events.push(`push:${userId}`); });
  paymentStepMock.mockImplementation(async () => { events.push('payment-step'); });
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('an automatic no-show refund runs its payment-record step once, with the dispute id, after the admin event and the pushes', async () => {
  const events: string[] = [];
  primeFiling(events, false);

  await expect(fileDispute(booking.id, booking.customer_id, {
    type: 'no_show', description: 'The provider never arrived.',
  })).resolves.toMatchObject({ status: 'resolved' });

  expect(paymentStepMock.mock.calls).toEqual([
    [booking.id, 12000, 'Auto-resolved dispute refund', 'wallet', 'dispute-auto'],
  ]);
  expect(events).toEqual([
    'refund', 'commit', 'admin-event', 'push:customer-auto', 'push:provider-user-auto', 'payment-step',
  ]);
});

it('a filing whose automatic refund fails runs no payment-record step', async () => {
  const events: string[] = [];
  primeFiling(events, true);

  await expect(fileDispute(booking.id, booking.customer_id, {
    type: 'no_show', description: 'The provider never arrived.',
  })).rejects.toThrow('refund failed');

  expect(paymentStepMock).not.toHaveBeenCalled();
  expect(events).toEqual(['refund']);
});

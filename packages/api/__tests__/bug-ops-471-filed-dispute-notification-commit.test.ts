const queryMock = jest.fn();
const transactionMock = jest.fn();
const pushMock = jest.fn();
const refundMock = jest.fn();
const legacyRefundMock = jest.fn();
const retryMock = jest.fn();
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
  refundFromEscrow: (...args: unknown[]) => legacyRefundMock(...args),
}));
jest.mock('../src/services/gateway-retry.service', () => ({
  enqueueRetry: (...args: unknown[]) => retryMock(...args),
}));
jest.mock('../src/services/settings.service', () => ({ getSettingInteger: jest.fn(async () => 30) }));
jest.mock('../src/services/socket.service', () => ({
  emitAdminEvent: (...args: unknown[]) => emitMock(...args),
  ADMIN_EVENTS: { DISPUTE_FILED: 'dispute:filed' },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { fileDispute } from '../src/services/dispute.service';

it('Bug OPS-471 — filing records participant inboxes atomically and delivers push only after commit', async () => {
  for (const autoResolved of [false, true]) {
    for (const failure of ['none', 'push', 'notification', 'commit', 'refund'] as const) {
      if (!autoResolved && failure === 'refund') continue;
      jest.clearAllMocks();
      const events: string[] = [];
      const notifications: Array<{ userId: string; data: Record<string, unknown> }> = [];
      const state = { booking: 'completed_by_provider', dispute: '', refunded: false };
      const initial = { ...state };
      const booking = {
        id: 'booking-471', customer_id: 'customer-471', provider_id: 'provider-471',
        status: 'completed_by_provider', escrow_status: 'held', total_amount: '12000',
        scheduled_at: new Date(Date.now() - 3 * 60_000),
        completed_at: new Date(Date.now() - 60_000), confirmed_at: null,
      };
      const disputeRow = () => ({
        id: 'dispute-471', booking_id: booking.id, filed_by: booking.customer_id,
        type: autoResolved ? 'no_show' : 'substandard', status: state.dispute,
      });
      queryMock.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM bookings')) return { rows: [booking] };
        if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
        throw new Error(`Unexpected outer query: ${sql}`);
      });
      const client = { query: jest.fn(async (sql: string, params: unknown[] = []) => {
        if (sql.includes('INSERT INTO disputes')) {
          state.dispute = 'open';
          return { rows: [disputeRow()], rowCount: 1 };
        }
        if (sql.includes('UPDATE bookings')) {
          state.booking = sql.includes("status = 'resolved'") ? 'resolved' : 'disputed';
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('SELECT scheduled_at')) return { rows: [booking] };
        if (sql.includes('UPDATE disputes')) {
          state.dispute = 'resolved';
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('SELECT * FROM disputes')) return { rows: [disputeRow()] };
        if (sql.includes('SELECT user_id FROM providers')) return { rows: [{ user_id: 'provider-user-471' }] };
        if (sql.includes('INSERT INTO notifications')) {
          if (failure === 'notification') throw new Error('notification insert failed');
          const userId = params[0] as string;
          notifications.push({ userId, data: JSON.parse(params[3] as string) });
          events.push(`inbox:${userId}`);
          return { rows: [{ id: `notification-${userId}` }], rowCount: 1 };
        }
        throw new Error(`Unexpected transaction query: ${sql}`);
      }) };
      transactionMock.mockImplementation(async (callback: (arg: typeof client) => Promise<unknown>) => {
        try {
          const result = await callback(client);
          if (failure === 'commit') throw new Error('commit failed');
          events.push('commit');
          return result;
        } catch (error) {
          Object.assign(state, initial);
          notifications.length = 0;
          events.push('rollback');
          throw error;
        }
      });
      refundMock.mockImplementation(async (refundClient: unknown) => {
        expect(refundClient).toBe(client);
        expect(events).not.toContain('commit');
        state.refunded = true;
        events.push('refund');
        if (failure === 'refund') throw new Error('refund failed');
      });
      pushMock.mockImplementation(async ({ userId }: { userId: string }) => {
        expect(events).toContain('commit');
        events.push(`push:${userId}`);
        if (failure === 'push') throw new Error('push unavailable');
      });
      const result = fileDispute(booking.id, booking.customer_id, {
        type: autoResolved ? 'no_show' : 'substandard', description: 'Work needs review.',
      });
      if (failure === 'notification' || failure === 'commit' || failure === 'refund') {
        await expect(result).rejects.toThrow('failed');
        expect(state).toEqual(initial);
        expect(notifications).toEqual([]);
        expect(pushMock).not.toHaveBeenCalled();
        expect(emitMock).not.toHaveBeenCalled();
      } else {
        await expect(result).resolves.toMatchObject({ status: autoResolved ? 'resolved' : 'open' });
        const recipients = autoResolved ? ['customer-471', 'provider-user-471'] : ['provider-user-471'];
        expect(notifications.map((row) => row.userId)).toEqual(recipients);
        expect(pushMock).toHaveBeenCalledTimes(recipients.length);
        for (const row of notifications) {
          expect(row.data).toMatchObject({
            disputeId: 'dispute-471', bookingId: booking.id,
            type: 'dispute_update', notificationType: 'dispute_update',
            disputeStatus: autoResolved ? 'resolved' : 'open',
          });
          expect(events.indexOf(`inbox:${row.userId}`)).toBeLessThan(events.indexOf('commit'));
          expect(events.indexOf(`push:${row.userId}`)).toBeGreaterThan(events.indexOf('commit'));
          expect(pushMock).toHaveBeenCalledWith(expect.objectContaining({
            userId: row.userId, notificationId: `notification-${row.userId}`,
            data: expect.objectContaining({ disputeId: 'dispute-471', bookingId: booking.id }),
          }));
        }
        expect(refundMock).toHaveBeenCalledTimes(autoResolved ? 1 : 0);
        expect(state.refunded).toBe(autoResolved);
        expect(emitMock).toHaveBeenCalledTimes(1);
      }
      // The notification change must not move the refund out of its transaction
      // or introduce a second refund/retry invocation.
      expect(legacyRefundMock).not.toHaveBeenCalled();
      expect(retryMock).not.toHaveBeenCalled();
    }
  }
});

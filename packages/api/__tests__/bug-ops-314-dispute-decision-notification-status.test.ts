jest.mock('../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/socket.service', () => ({}));
jest.mock('../src/services/settings.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));

import { resolveDisputeInTransaction } from '../src/services/dispute.service';

it('Bug OPS-314 — participant dispute notifications say refund approved and direct users to processing status', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  let disputeSelectCount = 0;
  const client = {
    query: jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/SELECT \* FROM disputes/.test(sql)) {
        disputeSelectCount += 1;
        return {
          rows: [{
            id: 'dispute-1',
            booking_id: 'booking-1',
            filed_by: 'customer-1',
            type: 'incomplete',
            description: 'Incomplete service',
            status: disputeSelectCount === 1 ? 'under_review' : 'resolved',
            tier: 2,
            assigned_to: 'admin-1',
            resolution_type: disputeSelectCount === 1 ? null : 'full_refund',
            refund_amount: disputeSelectCount === 1 ? '0' : '100000',
            refund_percent: disputeSelectCount === 1 ? null : '100',
            decision_notes: 'Evidence supports the customer claim.',
            internal_notes: null,
            provider_response: null,
            provider_responded_at: null,
            auto_resolved: false,
            resolved_at: null,
            resolved_by: null,
            created_at: new Date('2026-09-01T00:00:00.000Z'),
            updated_at: new Date('2026-09-01T00:00:00.000Z'),
          }],
          rowCount: 1,
        };
      }
      if (/FROM bookings/.test(sql)) {
        return {
          rows: [{
            id: 'booking-1', customer_id: 'customer-1', provider_id: 'provider-1',
            status: 'disputed', escrow_status: 'held', total_amount: '100000',
            scheduled_at: null, completed_at: null, confirmed_at: null,
          }],
          rowCount: 1,
        };
      }
      if (/SELECT user_id FROM providers/.test(sql)) {
        return { rows: [{ user_id: 'provider-user-1' }], rowCount: 1 };
      }
      if (/INSERT INTO notifications/.test(sql)) {
        return { rows: [{ id: `notification-${calls.filter((call) => /INSERT INTO notifications/.test(call.sql)).length}` }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    }),
  };

  await resolveDisputeInTransaction(client, 'dispute-1', 'admin-1', {
    resolutionType: 'full_refund',
    decisionNotes: 'Evidence supports a full refund for incomplete work.',
  });

  const notifications = calls.filter((call) => /INSERT INTO notifications/.test(call.sql));
  expect(notifications).toHaveLength(2);
  expect(notifications.every((call) => call.params[1] === 'Dispute Decision Recorded')).toBe(true);
  expect(notifications.every((call) => String(call.params[2]).includes('Full refund approved'))).toBe(true);
  expect(notifications.every((call) => String(call.params[2]).includes('processing status'))).toBe(true);
  expect(notifications.every((call) => !String(call.params[2]).includes('refund issued'))).toBe(true);
  expect(notifications.every((call) => String(call.params[3]).includes('"notificationType":"dispute_update"'))).toBe(true);
});

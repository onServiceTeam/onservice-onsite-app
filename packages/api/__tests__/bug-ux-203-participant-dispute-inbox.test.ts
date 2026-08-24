const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/socket.service', () => ({ emitAdminEvent: jest.fn(), ADMIN_EVENTS: {} }));
jest.mock('../src/services/settings.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));

import { listUserDisputes } from '../src/services/dispute.service';

it('Bug UX-203 — the participant dispute inbox includes cases assigned to the signed-in provider', async () => {
  const providerUserId = '11111111-1111-4111-8111-111111111111';
  const bookingId = '22222222-2222-4222-8222-222222222222';
  const row = { id: 'dispute-1', booking_id: bookingId, filed_by: 'customer-1', customer_name: 'Ana Cruz', provider_name: 'Cebu Prime' };
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [row], rowCount: 1 });

  const result = await listUserDisputes(providerUserId, { bookingId, page: 1, pageSize: 20 });

  expect(result).toEqual({ disputes: [row], total: 1 });
  const [countSql, countParams] = queryMock.mock.calls[0] as [string, unknown[]];
  expect(countSql).toContain('participant_provider.user_id = $1');
  expect(countParams).toEqual([providerUserId, bookingId]);
});

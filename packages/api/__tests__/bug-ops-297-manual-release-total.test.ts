const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/services/escrow.service', () => ({
  releaseEscrowInTransaction: jest.fn().mockResolvedValue({
    commissionAmount: 15000,
    serviceFeeAmount: 10000,
    providerReceives: 85000,
    platformRetains: 24850,
    guaranteeFundContribution: 150,
  }),
}));
jest.mock('../src/services/payment.service', () => ({ processRefund: jest.fn() }));
jest.mock('../src/services/gateway-retry.service', () => ({ enqueueRetry: jest.fn() }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/or.service', () => ({ issueOR: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitAdminEvent: jest.fn(), ADMIN_EVENTS: {} }));
jest.mock('../src/services/matching.service', () => ({}));
jest.mock('../src/services/booking-financial-terms.service', () => ({}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { manualReleaseEscrow } from '../src/services/booking-admin.service';

it('Bug OPS-297 — a manual release reports the full amount moved out of escrow', async () => {
  transactionMock.mockImplementation(async (callback: (client: { query: jest.Mock }) => Promise<unknown>) => callback({
    query: jest.fn().mockResolvedValue({ rows: [{ id: 'action-297' }], rowCount: 1 }),
  }));

  const result = await manualReleaseEscrow(
    '11111111-1111-4111-8111-111111111111',
    'Support verified completion and payout evidence',
    '22222222-2222-4222-8222-222222222222',
  );

  expect(result.releasedAmount).toBe(110000);
});

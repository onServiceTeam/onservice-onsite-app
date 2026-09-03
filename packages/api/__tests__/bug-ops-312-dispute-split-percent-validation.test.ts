const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/dispute.service', () => ({ assertDisputeResolutionAvailable: jest.fn() }));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));

import { adminResolveDispute } from '../src/services/dispute-admin.service';

it('Bug OPS-312 — split decisions reject a non-finite refund percentage before any settlement transaction starts', async () => {
  await expect(adminResolveDispute(
    'dispute-1',
    {
      resolutionType: 'split_decision',
      refundPercent: Number.NaN,
      decisionNotes: 'The submitted allocation is not a usable financial instruction.',
    },
    'admin-1',
  )).rejects.toMatchObject({ statusCode: 400 });
  expect(transactionMock).not.toHaveBeenCalled();
});

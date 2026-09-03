const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/dispute.service', () => ({}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));

import { reopenDispute } from '../src/services/dispute-admin.service';

it('Bug OPS-317 — settled dispute reopen is blocked before any state or settlement record can be rewritten', async () => {
  await expect(reopenDispute(
    'dispute-1',
    'New evidence requires a supplemental review record.',
    'admin-1',
  )).rejects.toMatchObject({
    statusCode: 409,
    message: expect.stringContaining('linked support case'),
  });
  expect(transactionMock).not.toHaveBeenCalled();
});

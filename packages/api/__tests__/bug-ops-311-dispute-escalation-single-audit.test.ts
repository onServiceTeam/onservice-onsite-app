const dbQueryMock = jest.fn();
const escalateDisputeMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/dispute.service', () => ({
  escalateDispute: (...args: unknown[]) => escalateDisputeMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));

import { adminEscalateDispute } from '../src/services/dispute-admin.service';

it('Bug OPS-311 — admin escalation returns the canonical transactional audit instead of inserting a duplicate', async () => {
  escalateDisputeMock.mockResolvedValue({ tier: 2, adminActionId: 'audit-escalation-1' });

  await expect(adminEscalateDispute(
    'dispute-1',
    'The evidence requires senior trust and safety review.',
    'admin-1',
  )).resolves.toEqual({
    disputeId: 'dispute-1',
    newTier: 2,
    adminActionId: 'audit-escalation-1',
  });
  expect(escalateDisputeMock).toHaveBeenCalledWith(
    'dispute-1',
    'admin-1',
    'The evidence requires senior trust and safety review.',
  );
  expect(dbQueryMock).not.toHaveBeenCalled();
});

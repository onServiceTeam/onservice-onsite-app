const dbQueryMock = jest.fn();
const assignDisputeMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/dispute.service', () => ({
  assignDispute: (...args: unknown[]) => assignDisputeMock(...args),
}));
jest.mock('../src/services/escrow.service', () => ({}));
jest.mock('../src/services/gateway-retry.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));

import { adminAssignDispute } from '../src/services/dispute-admin.service';

it('Bug OPS-310 — admin assignment returns the canonical transactional audit instead of inserting a duplicate', async () => {
  assignDisputeMock.mockResolvedValue({ tier: 1, adminActionId: 'audit-assignment-1' });

  await expect(adminAssignDispute('dispute-1', 'assignee-1', 'admin-1')).resolves.toEqual({
    disputeId: 'dispute-1',
    assignedTo: 'assignee-1',
    adminActionId: 'audit-assignment-1',
  });
  expect(assignDisputeMock).toHaveBeenCalledWith('dispute-1', 'admin-1', 'assignee-1');
  expect(dbQueryMock).not.toHaveBeenCalled();
});

const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { addStaffMember } from '../src/services/staff.service';

it('Bug UX-854 — adding a staff directory profile rejects a missing or short audit reason before opening a transaction', async () => {
  await expect(addStaffMember({
    userId: '11111111-1111-4111-8111-111111111111',
    roleId: '22222222-2222-4222-8222-222222222222',
    addedByAdminId: '33333333-3333-4333-8333-333333333333',
    reason: undefined as unknown as string,
  })).rejects.toThrow('Reason must be at least 10 characters.');
  await expect(addStaffMember({
    userId: '11111111-1111-4111-8111-111111111111',
    roleId: '22222222-2222-4222-8222-222222222222',
    addedByAdminId: '33333333-3333-4333-8333-333333333333',
    reason: 'short',
  })).rejects.toThrow('Reason must be at least 10 characters.');
  expect(dbTransactionMock).not.toHaveBeenCalled();
});

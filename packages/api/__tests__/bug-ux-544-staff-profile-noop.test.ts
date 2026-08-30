const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (callback: unknown) => dbTransactionMock(callback) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateStaffMember } from '../src/services/staff.service';

it('Bug UX-544 — an unchanged staff profile is rejected before an update or misleading audit record is written', async () => {
  const query = jest.fn().mockResolvedValueOnce({ rows: [{
    id: 'staff-1', user_id: 'user-1', role_id: 'role-1', role_name: 'support_agent',
    is_active: true, last_login_at: null, created_at: new Date(), updated_at: new Date(),
  }] });
  dbTransactionMock.mockImplementationOnce(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }));

  await expect(updateStaffMember(
    'staff-1',
    { roleId: 'role-1', isActive: true },
    'super-1',
    'Keep the same profile without a real operational change.',
  )).rejects.toMatchObject({ statusCode: 409 });
  expect(query).toHaveBeenCalledTimes(1);
});

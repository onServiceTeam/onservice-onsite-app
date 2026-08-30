const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (callback: unknown) => dbTransactionMock(callback) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: jest.fn(),
}));

import { assignBusinessAccountManager } from '../src/services/business.service';

it('Bug UX-548 — assigning a business relationship owner validates active admin access and audits before and after owners transactionally', async () => {
  const account = { id: 'business-1', account_manager_id: 'manager-old' };
  const updated = { ...account, account_manager_id: 'manager-new' };
  const hydrated = {
    ...updated,
    manager_name: 'Maria Reyes',
    manager_email: 'maria@example.com',
    manager_account_role: 'admin',
    manager_profile_id: 'profile-1',
    manager_profile_name: 'support_agent',
    manager_profile_active: true,
  };
  const query = jest.fn()
    .mockResolvedValueOnce({ rows: [account], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      user_id: 'manager-new', profile_id: 'profile-1', account_role: 'admin', profile_name: 'support_agent',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [updated], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [hydrated], rowCount: 1 });
  dbTransactionMock.mockImplementationOnce(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }));

  await expect(assignBusinessAccountManager({
    businessId: 'business-1',
    accountManagerId: 'manager-new',
    assignedByAdminId: 'super-1',
    reason: 'Transfer the relationship to the enterprise support owner.',
  })).resolves.toMatchObject({
    account_manager_id: 'manager-new',
    manager_name: 'Maria Reyes',
    manager_profile_name: 'support_agent',
  });

  const managerLookup = query.mock.calls[1]?.[0] as string;
  expect(managerLookup).toContain("u.role IN ('admin', 'super_admin')");
  expect(managerLookup).toContain('u.is_active = TRUE');
  expect(managerLookup).toContain('FOR SHARE OF u, ast, ar');
  const audit = query.mock.calls[3];
  expect(audit?.[0]).toContain('INSERT INTO admin_actions');
  expect(JSON.parse((audit?.[1] as unknown[])[2] as string)).toMatchObject({
    previousManagerId: 'manager-old',
    newManagerId: 'manager-new',
    managerAccountRole: 'admin',
  });
  expect(query.mock.calls[4]?.[0]).toContain('LEFT JOIN users assigned');
});

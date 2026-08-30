const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { formatBusinessAccount, getBusinessAccountAdmin } from '../src/services/business.service';

it('Bug UX-554 — Business 360 resolves the current relationship owner account and directory context instead of returning only a UUID', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [{
    id: 'business-1', company_name: 'Cebu Offices', business_type: 'corporation',
    registration_number: null, tax_id: null, billing_address: '', barangay: '', city: 'Cebu City',
    province: 'Cebu', contact_person: 'Paolo', contact_email: 'paolo@example.com', contact_phone: '+639170000000',
    account_manager_id: 'manager-1', owner_user_id: 'owner-1', status: 'active', payment_terms: 'net_30',
    volume_discount_rate: '10', monthly_credit_limit: 5000000, notes: null,
    created_at: new Date('2026-08-01T00:00:00.000Z'), updated_at: new Date('2026-08-01T00:00:00.000Z'),
    owner_name: 'Paolo Garcia', manager_name: 'Maria Reyes', manager_email: 'maria@example.com',
    manager_account_role: 'admin', manager_is_active: true, manager_profile_id: 'profile-1',
    manager_profile_name: 'support_agent', manager_profile_active: true,
  }], rowCount: 1 });

  const formatted = formatBusinessAccount(await getBusinessAccountAdmin('business-1'));

  expect(formatted).toMatchObject({
    ownerName: 'Paolo Garcia',
    accountManagerId: 'manager-1',
    accountManagerName: 'Maria Reyes',
    accountManagerEmail: 'maria@example.com',
    accountManagerRole: 'admin',
    accountManagerIsActive: true,
    accountManagerProfileName: 'support_agent',
    accountManagerProfileIsActive: true,
  });
  expect(dbQueryMock.mock.calls[0]?.[0]).toContain('LEFT JOIN users manager');
  expect(dbQueryMock.mock.calls[0]?.[0]).toContain('LEFT JOIN admin_staff');
});

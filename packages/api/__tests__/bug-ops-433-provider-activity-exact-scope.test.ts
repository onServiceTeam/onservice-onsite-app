const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getMaxProviderServiceRadiusKm: jest.fn().mockResolvedValue(50),
}));

import { getProviderActivity } from '../src/services/provider-admin.service';

it('Bug OPS-433 - exact provider activity is scoped by provider ownership and admin-action ID', async () => {
  const providerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const providerUserId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const adminActionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{
      user_id: providerUserId, phone: '+639171234567', first_name: 'Paolo', last_name: 'Santos',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{
      id: adminActionId,
      admin_id: 'admin-1',
      admin_first: 'Support',
      admin_last: 'Lead',
      action_type: 'provider_suspended',
      reason: 'Identity risk investigation',
      details: {},
      created_at: new Date('2026-09-03T08:00:00.000Z'),
    }], rowCount: 1 });

  const result = await getProviderActivity(providerId, 200, 'admin', adminActionId);

  expect(result).toEqual([
    expect.objectContaining({ id: `admin_action:${adminActionId}`, action: 'provider_suspended' }),
  ]);
  expect(String(dbQueryMock.mock.calls[3]?.[0])).toContain(
    "OR (a.target_type = 'user' AND a.target_id = $2))",
  );
  expect(String(dbQueryMock.mock.calls[3]?.[0])).toContain('AND a.id = $3');
  expect(dbQueryMock.mock.calls[3]?.[1]).toEqual([providerId, providerUserId, adminActionId, 1]);
});

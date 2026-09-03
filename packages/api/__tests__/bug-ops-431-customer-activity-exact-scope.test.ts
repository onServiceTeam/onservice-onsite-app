const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/services/settings.service', () => ({}));

import { getCustomerActivity } from '../src/services/customer-admin.service';

it('Bug OPS-431 - exact customer activity is scoped by customer target and admin-action ID', async () => {
  const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const adminActionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ phone: '+639171234567', first_name: 'Ana', last_name: 'Reyes' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{
      id: adminActionId,
      admin_id: 'admin-1',
      admin_first: 'Support',
      admin_last: 'Lead',
      action_type: 'customer_suspended',
      reason: 'Account takeover investigation',
      details: {},
      created_at: new Date('2026-09-03T07:00:00.000Z'),
    }], rowCount: 1 });

  const result = await getCustomerActivity(customerId, 200, 'admin', adminActionId);

  expect(result).toEqual([
    expect.objectContaining({ id: `admin_action:${adminActionId}`, action: 'customer_suspended' }),
  ]);
  expect(String(dbQueryMock.mock.calls[3]?.[0])).toContain(
    "a.target_id = $1 AND a.target_type IN ('customer', 'user') AND a.id = $2",
  );
  expect(dbQueryMock.mock.calls[3]?.[1]).toEqual([customerId, adminActionId, 1]);
});

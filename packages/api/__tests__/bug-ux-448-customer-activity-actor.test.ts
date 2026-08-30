const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock, transaction: jest.fn() },
}));

import { getCustomerActivity } from '../src/services/customer-admin.service';

it('Bug UX-448 — customer activity identifies the customer and admin actors behind operational events', async () => {
  queryMock
    .mockResolvedValueOnce({
      rows: [{ phone: '+639171234567', first_name: 'Ana', last_name: 'Reyes' }], rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'audit-1', user_id: 'customer-1', actor_first: 'Ana', actor_last: 'Reyes',
        action: 'profile_updated', ip_address: '10.1.2.3', user_agent: 'onService/1.0',
        new_values: { city: 'Cebu City' }, created_at: new Date('2026-08-30T01:00:00.000Z'),
      }], rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'login-1', attempt_type: 'otp_verify', success: true, ip_address: '10.1.2.4',
        user_agent: 'Expo/55', created_at: new Date('2026-08-30T02:00:00.000Z'),
      }], rowCount: 1,
    })
    .mockResolvedValueOnce({
      rows: [{
        id: 'action-1', admin_id: 'admin-1', admin_first: 'Sam', admin_last: 'Support',
        action_type: 'customer_suspended', reason: 'Account takeover confirmed.', details: {},
        created_at: new Date('2026-08-30T03:00:00.000Z'),
      }], rowCount: 1,
    });

  const activity = await getCustomerActivity('customer-1', 50, 'super_admin');

  expect(activity[0]).toMatchObject({
    source: 'admin_action',
    actor: { kind: 'admin', id: 'admin-1', name: 'Sam Support' },
  });
  expect(activity[1]).toMatchObject({
    source: 'login',
    actor: { kind: 'customer', id: 'customer-1', name: 'Ana Reyes' },
  });
  expect(activity[2]).toMatchObject({
    source: 'audit',
    actor: { kind: 'customer', id: 'customer-1', name: 'Ana Reyes' },
  });
});

const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock, transaction: jest.fn() },
}));

import { getCustomerActivity } from '../src/services/customer-admin.service';

it('MED-N17 — customer activity masks network fingerprints for junior admins while retaining non-network admin actions', async () => {
  queryMock
    .mockResolvedValueOnce({
      rows: [{ phone: '+639171234567', first_name: 'Ana', last_name: 'Reyes' }], rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{
      id: 'audit-1', user_id: 'customer-1', actor_first: 'Ana', actor_last: 'Reyes',
      action: 'profile_updated', ip_address: '192.168.1.42',
      user_agent: 'Mozilla/5.0 Chrome/120', new_values: { city: 'Cebu City' },
      created_at: new Date('2026-08-30T01:00:00.000Z'),
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'login-1', attempt_type: 'otp_verify', success: true,
      ip_address: '192.168.1.43', user_agent: 'Mozilla/5.0 Safari/605',
      created_at: new Date('2026-08-30T02:00:00.000Z'),
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'action-1', admin_id: 'admin-1', admin_first: 'Sam', admin_last: 'Support',
      action_type: 'customer_suspended', reason: 'Account takeover confirmed.', details: {},
      created_at: new Date('2026-08-30T03:00:00.000Z'),
    }], rowCount: 1 });

  const activity = await getCustomerActivity('customer-1', 50, 'admin');

  expect(activity.find((row) => row.source === 'audit')).toMatchObject({
    ipAddress: '192.168.1.***', userAgent: 'Chrome',
  });
  expect(activity.find((row) => row.source === 'login')).toMatchObject({
    ipAddress: '192.168.1.***', userAgent: 'Safari',
  });
  expect(activity.find((row) => row.source === 'admin_action')).toMatchObject({
    ipAddress: null, userAgent: null,
  });
});

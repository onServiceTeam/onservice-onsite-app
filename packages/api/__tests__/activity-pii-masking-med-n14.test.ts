const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: queryMock, transaction: jest.fn() },
}));

import { getProviderActivity } from '../src/services/provider-admin.service';

function queueProviderActivity(): void {
  queryMock
    .mockResolvedValueOnce({ rows: [{ user_id: 'user-1', phone: '+639171234567' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'audit-1', action: 'profile_updated', entity_type: 'provider',
      ip_address: '192.168.1.42', user_agent: 'Mozilla/5.0 Chrome/120',
      new_values: { city: 'Cebu City' }, created_at: new Date('2026-08-30T01:00:00.000Z'),
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'login-1', attempt_type: 'otp_verify', success: true,
      ip_address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      user_agent: 'Mozilla/5.0 Safari/605', created_at: new Date('2026-08-30T02:00:00.000Z'),
    }], rowCount: 1 });
}

it('MED-N14 — provider activity masks network fingerprints by default and reveals raw values only to super-admin', async () => {
  queueProviderActivity();
  const restricted = await getProviderActivity('provider-1', 50);
  expect(restricted.find((row) => row.source === 'audit')).toMatchObject({
    ipAddress: '192.168.1.***', userAgent: 'Chrome',
  });
  expect(restricted.find((row) => row.source === 'login')).toMatchObject({
    ipAddress: '2001:0db8:85a3:0000:****', userAgent: 'Safari',
  });

  queryMock.mockReset();
  queueProviderActivity();
  const unrestricted = await getProviderActivity('provider-1', 50, 'super_admin');
  expect(unrestricted.find((row) => row.source === 'audit')).toMatchObject({
    ipAddress: '192.168.1.42', userAgent: 'Mozilla/5.0 Chrome/120',
  });
});

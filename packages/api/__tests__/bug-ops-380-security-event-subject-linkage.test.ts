const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/config/platform.config', () => ({
  platformConfig: { otpLockoutThresholds: [], maxPageSize: 100 },
}));
jest.mock('../src/services/settings.service', () => ({ getSettingInteger: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { formatSecurityEvent, listSecurityEvents } from '../src/services/security.service';

it('Bug OPS-380 — security events expose the canonical account role and provider-staff employer linkage', async () => {
  dbQueryMock
    .mockResolvedValueOnce({
      rows: [{
        id: 'event-380',
        user_id: '38000000-0000-4000-8000-000000000380',
        user_role: 'provider_staff',
        user_name: 'Alex Santos',
        user_email: 'alex@example.com',
        provider_profile_id: '38000000-0000-4000-8000-000000003800',
        event_type: 'new_device_login',
        ip_address: '203.0.113.80',
        device_fingerprint: 'device-380',
        metadata: {},
        created_at: new Date('2026-09-03T00:00:00.000Z'),
      }],
      rowCount: 1,
    })
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 });

  const result = await listSecurityEvents(1, 20, { userId: '38000000-0000-4000-8000-000000000380' });
  expect(result.total).toBe(1);
  const eventQuery = dbQueryMock.mock.calls[0]?.[0] as string;
  expect(eventQuery).toMatch(/u\.role AS user_role/);
  expect(eventQuery).toMatch(/COALESCE\(p\.id, staff_account\.provider_id\) AS provider_profile_id/);
  expect(eventQuery).toMatch(/LEFT JOIN LATERAL[\s\S]*provider_staff/);
  expect(eventQuery).toMatch(/WHERE se\.user_id = \$1/);
  expect(formatSecurityEvent(result.items[0]!)).toMatchObject({
    userRole: 'provider_staff',
    userName: 'Alex Santos',
    userEmail: 'alex@example.com',
    providerProfileId: '38000000-0000-4000-8000-000000003800',
  });
});

const dbQueryMock = jest.fn();
const clientQueryMock = jest.fn();
const getSettingIntegerMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: (client: { query: typeof clientQueryMock }) => unknown) => (
      callback({ query: clientQueryMock })
    ),
  },
}));
jest.mock('../src/config/platform.config', () => ({
  platformConfig: { otpLockoutThresholds: [], maxPageSize: 100 },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: (...args: unknown[]) => getSettingIntegerMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { detectSuspiciousIps } from '../src/services/security.service';

it('Bug SEC-033 — automatic re-blocking reuses the newest inactive IP row instead of creating duplicate history rows', async () => {
  getSettingIntegerMock.mockResolvedValueOnce(10);
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ ip_address: '203.0.113.33', fail_count: '12' }] })
    .mockResolvedValueOnce({
      rows: [{
        id: '33000000-0000-4000-8000-000000000033',
        ip_address: '203.0.113.33',
        currently_blocked: false,
      }],
    });
  clientQueryMock.mockResolvedValue({ rows: [], rowCount: 1 });

  await expect(detectSuspiciousIps()).resolves.toBe(1);

  expect(clientQueryMock).toHaveBeenCalledWith(
    expect.stringMatching(/UPDATE blocked_ips AS blocked[\s\S]*is_active = TRUE/),
    [
      '33000000-0000-4000-8000-000000000033',
      'Auto-blocked: 12 failed login attempts in 1 hour',
    ],
  );
  expect(clientQueryMock.mock.calls.some(([sql]) => (
    /INSERT INTO blocked_ips/.test(String(sql))
  ))).toBe(false);
  expect(clientQueryMock.mock.calls.some(([sql]) => (
    /INSERT INTO security_events/.test(String(sql))
  ))).toBe(true);
});

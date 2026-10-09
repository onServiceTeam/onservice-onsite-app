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

import { listBlockedIps } from '../src/services/security.service';

it('Bug OPS-379 — the active-block queue excludes expired rows before the cleanup worker runs', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

  await expect(listBlockedIps(1, 20)).resolves.toEqual({ items: [], total: 0 });

  expect(dbQueryMock).toHaveBeenCalledTimes(2);
  for (const [sql] of dbQueryMock.mock.calls) {
    expect(sql).toMatch(/is_active = TRUE/);
    expect(sql).toMatch(/expires_at IS NULL OR expires_at > NOW\(\)/);
  }
});

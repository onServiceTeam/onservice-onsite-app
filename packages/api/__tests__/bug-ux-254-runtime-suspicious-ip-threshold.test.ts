const dbQueryMock = jest.fn();
const getSettingIntegerMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/config/platform.config', () => ({
  platformConfig: { otpLockoutThresholds: [] },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: (...args: unknown[]) => getSettingIntegerMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { detectSuspiciousIps } from '../src/services/security.service';

it('Bug UX-254 — suspicious-IP detection applies the live admin threshold to its query', async () => {
  getSettingIntegerMock.mockResolvedValueOnce(37);
  dbQueryMock.mockResolvedValueOnce({ rows: [] });

  await expect(detectSuspiciousIps()).resolves.toBe(0);

  expect(getSettingIntegerMock).toHaveBeenCalledWith('suspicious_ip_threshold');
  expect(dbQueryMock.mock.calls[0]?.[1]).toEqual([37]);
});

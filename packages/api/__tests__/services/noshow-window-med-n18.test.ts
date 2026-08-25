const mockGetSettingInteger = jest.fn();

jest.mock('../../src/models/db', () => ({ db: { query: jest.fn(), transaction: jest.fn() } }));
jest.mock('../../src/services/settings.service', () => ({
  getSettingInteger: (...args: unknown[]) => mockGetSettingInteger(...args),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { resolveNoShowAutoResolutionWindowMinutes } from '../../src/services/dispute.service';

it('MED-N18 — no-show auto-resolution uses the Admin setting and falls back to 30 minutes only when it is unavailable', async () => {
  mockGetSettingInteger.mockResolvedValueOnce(45).mockRejectedValueOnce(new Error('settings unavailable'));

  await expect(resolveNoShowAutoResolutionWindowMinutes()).resolves.toBe(45);
  await expect(resolveNoShowAutoResolutionWindowMinutes()).resolves.toBe(30);
  expect(mockGetSettingInteger).toHaveBeenNthCalledWith(1, 'noshow_auto_resolve_window_minutes');
  expect(mockGetSettingInteger).toHaveBeenNthCalledWith(2, 'noshow_auto_resolve_window_minutes');
});

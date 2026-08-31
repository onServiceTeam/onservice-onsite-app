const dbQueryMock = jest.fn();
const getNbiExpiryWarningDaysMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));

jest.mock('../src/services/settings.service', () => ({
  getNbiExpiryWarningDays: (...args: unknown[]) => getNbiExpiryWarningDaysMock(...args),
}));

import { getProviderNbiStatus } from '../src/services/provider.service';

it('Bug UX-841 — provider NBI status uses the authoritative warning-window control', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      nbi_clearance_url: 'https://files.example/nbi.jpg',
      nbi_expiry_date: new Date(Date.now() + 40 * 86_400_000).toISOString(),
    }],
  });
  getNbiExpiryWarningDaysMock.mockResolvedValueOnce(45);

  const result = await getProviderNbiStatus('provider-1');

  expect(getNbiExpiryWarningDaysMock).toHaveBeenCalledTimes(1);
  expect(result.status).toBe('expiring');
});

const mockDbQuery = jest.fn();
const mockDbTransaction = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => mockDbQuery(...args),
    transaction: (...args: unknown[]) => mockDbTransaction(...args),
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingInteger: jest.fn().mockResolvedValue(10),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { detectSuspiciousIps } from '../src/services/security.service';

it('MED-N65 - suspicious-IP detection skips active blocks and writes all new blocks in two transaction queries', async () => {
  mockDbTransaction.mockImplementation(async (
    callback: (client: { query: typeof mockDbQuery }) => Promise<unknown>,
  ) => callback({ query: mockDbQuery }));
  mockDbQuery
    .mockResolvedValueOnce({
      rows: [
        { ip_address: '1.2.3.4', fail_count: '12' },
        { ip_address: '5.6.7.8', fail_count: '14' },
        { ip_address: '9.9.9.9', fail_count: '16' },
      ],
      rowCount: 3,
    })
    .mockResolvedValueOnce({ rows: [{ ip_address: '5.6.7.8' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 2 })
    .mockResolvedValueOnce({ rows: [], rowCount: 2 });

  const blocked = await detectSuspiciousIps();

  expect(blocked).toBe(2);
  expect(mockDbQuery).toHaveBeenCalledTimes(4);
  expect(mockDbQuery.mock.calls[1]![0]).toMatch(/ip_address = ANY\(\$1::inet\[\]\)/);
  expect(mockDbQuery.mock.calls[1]![1]).toEqual([['1.2.3.4', '5.6.7.8', '9.9.9.9']]);
  expect(mockDbQuery.mock.calls[2]![0]).toMatch(/INSERT INTO blocked_ips[\s\S]*VALUES \(\$1::inet/);
  expect(mockDbQuery.mock.calls[2]![1]).toEqual([
    '1.2.3.4',
    'Auto-blocked: 12 failed login attempts in 1 hour',
    '9.9.9.9',
    'Auto-blocked: 16 failed login attempts in 1 hour',
  ]);
  expect(mockDbQuery.mock.calls[3]![0]).toMatch(/INSERT INTO security_events/);
  expect(mockDbTransaction).toHaveBeenCalledTimes(1);
});

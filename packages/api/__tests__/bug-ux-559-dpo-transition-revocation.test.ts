const queryMock = jest.fn();
const transactionMock = jest.fn();
const mockDisconnectUserSockets = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => transactionMock(callback),
  },
}));
jest.mock('../src/services/socket.service', () => ({ disconnectUserSockets: mockDisconnectUserSockets }));
jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { demoteFromDpo, promoteToDpo } from '../src/services/staff.service';

it('Bug UX-559 — DPO handover is admin-only and atomically revokes every old credential family', async () => {
  transactionMock.mockImplementation(async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }));

  queryMock.mockResolvedValueOnce({
    rows: [{ id: 'external-1', role: 'customer', is_active: true, session_version: 1 }],
    rowCount: 1,
  });
  await expect(promoteToDpo('external-1', 'super-1', 'Dedicated privacy appointment approved.'))
    .rejects.toThrow(/dedicated active admin account/);
  expect(mockDisconnectUserSockets).not.toHaveBeenCalled();

  queryMock.mockReset();
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'admin', is_active: true, session_version: 4 }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 })
    .mockResolvedValueOnce({ rows: [{ session_version: 5 }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 3 })
    .mockResolvedValueOnce({ rows: [], rowCount: 2 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  const promoted = await promoteToDpo('admin-1', 'super-1', 'Dedicated privacy appointment approved.');
  expect(promoted).toMatchObject({
    previousRole: 'admin', newRole: 'dpo', sessionVersion: 5,
    revokedRefreshTokens: 3, revokedCsrfTokens: 2,
  });
  expect(queryMock.mock.calls.some(([sql]) => /session_version = session_version \+ 1/.test(sql as string))).toBe(true);
  expect(queryMock.mock.calls.some(([sql]) => /DELETE FROM refresh_tokens/.test(sql as string))).toBe(true);
  expect(queryMock.mock.calls.some(([sql]) => /UPDATE admin_csrf_tokens/.test(sql as string))).toBe(true);
  expect(mockDisconnectUserSockets).toHaveBeenCalledWith('admin-1');

  queryMock.mockReset();
  mockDisconnectUserSockets.mockClear();
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 'admin-1', role: 'dpo' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ session_version: 6 }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  const demoted = await demoteFromDpo('admin-1', 'super-1', 'Documented privacy handover completed.');
  expect(demoted).toMatchObject({ previousRole: 'dpo', newRole: 'admin', sessionVersion: 6 });
  expect(mockDisconnectUserSockets).toHaveBeenCalledWith('admin-1');
});

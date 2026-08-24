const clientQueryMock = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
const transactionMock = jest.fn(async (callback: (client: { query: typeof clientQueryMock }) => Promise<unknown>) => (
  callback({ query: clientQueryMock })
));

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));

import { registerPushToken } from '../src/services/notification.service';

it('Bug UX-241 — registering a physical push token atomically removes every previous account owner', async () => {
  const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const token = 'ExponentPushToken[one-device]';

  await registerPushToken(userId, token, 'android');

  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(clientQueryMock).toHaveBeenCalledTimes(3);
  expect(String(clientQueryMock.mock.calls[0]?.[0])).toMatch(/pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  expect(clientQueryMock.mock.calls[0]?.[1]).toEqual([token]);
  expect(String(clientQueryMock.mock.calls[1]?.[0])).toMatch(
    /DELETE FROM push_tokens WHERE token = \$1 AND user_id <> \$2/,
  );
  expect(clientQueryMock.mock.calls[1]?.[1]).toEqual([token, userId]);
  expect(String(clientQueryMock.mock.calls[2]?.[0])).toMatch(/INSERT INTO push_tokens/);
  expect(clientQueryMock.mock.calls[2]?.[1]).toEqual([userId, token, 'android']);
});

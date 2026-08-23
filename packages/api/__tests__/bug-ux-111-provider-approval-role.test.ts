const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { approveProvider } from '../src/services/admin.service';

it('BUG-UX-111 — admin approval grants provider role in the approval transaction', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      nbi_clearance_url: 'onboarding/user-1/nbi.jpg',
      government_id_front_url: 'onboarding/user-1/front.jpg',
      selfie_url: 'onboarding/user-1/selfie.jpg',
    }],
  });

  const transactionSql: string[] = [];
  dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
    const client = {
      query: jest.fn(async (sql: string) => {
        transactionSql.push(sql);
        if (/UPDATE providers/i.test(sql)) {
          return { rows: [{ id: 'provider-1', user_id: 'user-1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      }),
    };
    return (cb as (client: typeof client) => Promise<unknown>)(client);
  });

  await approveProvider('provider-1', 'admin-1');

  const providerUpdateIndex = transactionSql.findIndex((sql) => /UPDATE providers/i.test(sql));
  const roleUpdateIndex = transactionSql.findIndex((sql) => /UPDATE users SET role = 'provider'/i.test(sql));
  expect(providerUpdateIndex).toBeGreaterThanOrEqual(0);
  expect(roleUpdateIndex).toBeGreaterThan(providerUpdateIndex);
});

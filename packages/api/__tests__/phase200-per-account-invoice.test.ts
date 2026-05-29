// Phase 200 — per-account "generate invoice now" shares the monthly
// generator. generateInvoiceForAccount(id) must scope the eligible-accounts
// query to that one account (3rd query param = accountId); the monthly cron
// passes null (= all accounts). Both bill the just-ended month and return 0
// when there is nothing eligible.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: (...a: unknown[]) => dbQueryMock(...a),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ createNotification: jest.fn() }));

import { generateInvoiceForAccount, generateMonthlyInvoices } from '../src/services/invoice.service';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  // No eligible accounts → the generator returns 0 after the single
  // aggregate query, so we can inspect that query's params.
  dbQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Phase 200 — per-account invoice generation', () => {
  it('generateInvoiceForAccount scopes the aggregate query to the given account id', async () => {
    const count = await generateInvoiceForAccount('ba-123');
    expect(count).toBe(0);
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = dbQueryMock.mock.calls[0]! as [string, unknown[]];
    expect(sql).toMatch(/\$3::uuid IS NULL OR ba\.id = \$3::uuid/);
    expect(params[2]).toBe('ba-123'); // accountId threaded as $3
  });

  it('generateMonthlyInvoices passes null (= every eligible account)', async () => {
    const count = await generateMonthlyInvoices();
    expect(count).toBe(0);
    expect(dbQueryMock).toHaveBeenCalledTimes(1);
    const params = dbQueryMock.mock.calls[0]![1] as unknown[];
    expect(params[2]).toBeNull();
  });
});

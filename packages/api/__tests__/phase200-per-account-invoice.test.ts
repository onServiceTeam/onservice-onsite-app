// E55 Option A — legacy immediate generation is retired and the unattended
// monthly worker is held. Controlled preview/draft/finalize endpoints replace it.

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

describe('E55 — legacy business invoice generation containment', () => {
  it('rejects immediate per-account generation before database work', async () => {
    await expect(generateInvoiceForAccount('ba-123')).rejects.toMatchObject({ statusCode: 410 });
    expect(dbQueryMock).not.toHaveBeenCalled();
  });

  it('holds unattended monthly generation before database work', async () => {
    const count = await generateMonthlyInvoices();
    expect(count).toBe(0);
    expect(dbQueryMock).not.toHaveBeenCalled();
  });
});

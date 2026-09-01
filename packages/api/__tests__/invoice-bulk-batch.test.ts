const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { generateMonthlyInvoices } from '../src/services/invoice.service';

it('Bug OPS-327 — the legacy batch generator cannot emit unpreviewed sent invoices', async () => {
  const generated = await generateMonthlyInvoices();

  expect(generated).toBe(0);
  expect(dbQueryMock).not.toHaveBeenCalled();
});

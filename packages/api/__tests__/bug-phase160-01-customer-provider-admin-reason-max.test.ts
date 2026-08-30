const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: transactionMock },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import {
  creditCustomerWallet,
  updateCustomerStatus,
} from '../src/services/customer-admin.service';
import { adjustProviderWallet } from '../src/services/provider-admin.service';

it('BUG-PHASE160-01 — persisted customer and provider admin reasons reject more than 2,000 characters before a transaction starts', async () => {
  const overLimit = 'x'.repeat(2001);

  await expect(
    updateCustomerStatus('customer-1', 'suspend', overLimit, 'admin-1'),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    creditCustomerWallet('customer-1', 100, overLimit, 'admin-1'),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    adjustProviderWallet('provider-1', 100, overLimit, 'admin-1'),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(transactionMock).not.toHaveBeenCalled();
});

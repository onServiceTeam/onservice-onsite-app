jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { toggleChecklistItem } from '../src/services/checklist.service';
import { getTransactionInvocations, resetDbMock } from './helpers/d06-tx-mock';

beforeEach(resetDbMock);

it('Bug UX-304 — a customer cannot alter the provider execution checklist', async () => {
  await expect(toggleChecklistItem(
    'item-1',
    'customer-1',
    'customer',
    { completed: true },
  )).rejects.toMatchObject({ statusCode: 403 });

  expect(getTransactionInvocations()).toBe(0);
});
